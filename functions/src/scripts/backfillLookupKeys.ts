import * as admin from "firebase-admin"

const args = process.argv.slice(2)

type BackfillOptions = {
  email?: string
  uid?: string
  dryRun: boolean
  batchSize: number
}

const parseOptions = (): BackfillOptions => {
  const options: BackfillOptions = {
    dryRun: args.includes("--dry-run"),
    batchSize: 200,
  }

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === "--email" || token === "-e") {
      options.email = args[index + 1]
      index += 1
    } else if (token === "--uid" || token === "-u") {
      options.uid = args[index + 1]
      index += 1
    } else if (token === "--batch-size" || token === "-b") {
      const parsed = Number(args[index + 1])
      if (Number.isFinite(parsed) && parsed > 0) {
        options.batchSize = Math.min(Math.floor(parsed), 500)
      }
      index += 1
    }
  }

  return options
}

const options = parseOptions()

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed.toLowerCase() : null
}

const normalizePhone = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const digitsOnly = value.replace(/\D/g, "")
  const hasPlus = value.trim().startsWith("+")
  if (!digitsOnly && !hasPlus) return null

  if (hasPlus) {
    const cleaned = value.replace(/[^\d+]/g, "")
    return cleaned.startsWith("+") ? cleaned : `+${digitsOnly}`
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`
  }
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`
  }
  return `+${digitsOnly}`
}

const buildPhoneVariants = (raw: string | null): string[] => {
  if (!raw) return []

  const variants = new Set<string>()
  const push = (suffix: string) => {
    if (suffix.length) {
      variants.add(suffix)
    }
  }

  if (raw.startsWith("+")) {
    push(raw)
    push(raw.substring(1))
    if (raw.startsWith("+1") && raw.length > 2) {
      push(raw.substring(2))
    }
  } else {
    push(raw)
    if (raw.length === 10) {
      push("+1" + raw)
    } else if (raw.length === 11 && raw.startsWith("1")) {
      push(raw.substring(1))
      push("+" + raw)
    }
  }

  return Array.from(variants)
}

const ensureLookupKeys = (input: unknown[] | undefined, ...candidates: (string | null | undefined)[]) => {
  const keys = new Set<string>((Array.isArray(input) ? input : []).filter((value): value is string => typeof value === "string"))
  candidates.forEach((candidate) => {
    if (candidate && candidate.trim().length) {
      keys.add(candidate)
    }
  })
  return Array.from(keys)
}

type BookingData = admin.firestore.DocumentData & {
  lookupKeys?: string[]
  user?: { uid?: string | null; email?: string | null }
  passenger?: { email?: string | null; phone?: string | null }
}

const backfillBatch = async (snapshots: admin.firestore.QuerySnapshot<BookingData>) => {
  if (snapshots.empty) {
    return { processed: 0, mutated: 0 }
  }

  const batch = db.batch()
  let mutated = 0
  const mirrorTargets: Array<{ uid: string; bookingId: string; data: BookingData }> = []

  snapshots.docs.forEach((doc) => {
    const data = doc.data() ?? {}

    const lookupKeys = Array.isArray(data.lookupKeys) ? data.lookupKeys : []

    let bookingUserUid =
      typeof data.user?.uid === "string" && data.user.uid.trim().length > 0 ? data.user.uid.trim() : null
    if (!bookingUserUid) {
      const fromKeys = lookupKeys
        .filter((key): key is string => typeof key === "string")
        .find((key) => key.startsWith("uid:"))
      if (fromKeys) {
        bookingUserUid = fromKeys.slice(4)
      }
    }
    const userEmail = normalizeEmail(data.user?.email)
    const passengerEmail = normalizeEmail(data.passenger?.email)
    const passengerPhone = normalizePhone(data.passenger?.phone)
    const phoneVariants = buildPhoneVariants(passengerPhone)

    const enrichedKeys = ensureLookupKeys(
      lookupKeys,
      bookingUserUid ? `uid:${bookingUserUid}` : null,
      userEmail ? `email:${userEmail}` : null,
      passengerEmail ? `email:${passengerEmail}` : null,
      ...phoneVariants.map((phone) => `phone:${phone}`),
    )

    const updates: admin.firestore.UpdateData<BookingData> = {}
    let hasChanges = false

    if (JSON.stringify(enrichedKeys.sort()) !== JSON.stringify([...lookupKeys].sort())) {
      updates.lookupKeys = enrichedKeys
      hasChanges = true
    }

    if (userEmail && data.user?.email !== userEmail) {
      updates["user.email"] = userEmail
      hasChanges = true
    }
    if (bookingUserUid && data.user?.uid !== bookingUserUid) {
      updates["user.uid"] = bookingUserUid
      hasChanges = true
    }

    if (passengerEmail && data.passenger?.email !== passengerEmail) {
      updates["passenger.email"] = passengerEmail
      hasChanges = true
    }

    if (passengerPhone && data.passenger?.phone !== passengerPhone) {
      updates["passenger.phone"] = passengerPhone
      hasChanges = true
    }

    if (bookingUserUid) {
      mirrorTargets.push({ uid: bookingUserUid, bookingId: doc.id, data })
    }

    if (hasChanges) {
      mutated += 1
      if (options.dryRun) {
        console.log(`[DRY RUN] Would update booking ${doc.id}`, updates)
      } else {
        batch.update(doc.ref, updates)
      }
    }
  })

  if (!options.dryRun) {
    if (mutated > 0) {
      await batch.commit()
    }
    await Promise.all(
      mirrorTargets.map(({ uid, bookingId, data }) =>
        db
          .collection("customers")
          .doc(uid)
          .collection("bookings")
          .doc(bookingId)
          .set(
            {
              ...data,
              mirroredAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          ),
      ),
    )
  } else {
    mirrorTargets.forEach(({ bookingId, uid }) => {
      console.log(`[DRY RUN] Would mirror booking ${bookingId} to customers/${uid}/bookings/${bookingId}`)
    })
  }

  return { processed: snapshots.size, mutated }
}

const run = async () => {
  console.log("Starting lookup key backfill with options:", options)

  let query: admin.firestore.Query<BookingData> = db.collection("bookings").orderBy(admin.firestore.FieldPath.documentId())

  if (options.uid) {
    query = query.where("user.uid", "==", options.uid)
  }

  if (options.email) {
    const emailLower = options.email.trim().toLowerCase()
    // Attempt to narrow via user.email when available; fallback to lookupKeys.
    query = query.where("user.email", "==", emailLower)
  }

  let processed = 0
  let mutated = 0
  let lastDoc: admin.firestore.QueryDocumentSnapshot<BookingData> | undefined

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let pagedQuery = query.limit(options.batchSize)
    if (lastDoc) {
      pagedQuery = pagedQuery.startAfter(lastDoc)
    }

    const snapshot = await pagedQuery.get()
    if (snapshot.empty) {
      break
    }

    const result = await backfillBatch(snapshot)
    processed += result.processed
    mutated += result.mutated

    lastDoc = snapshot.docs[snapshot.docs.length - 1]

    console.log(
      `Processed ${processed} bookings so far (${mutated} ${options.dryRun ? "would be updated" : "updated"})`,
    )

    if (snapshot.size < options.batchSize) {
      break
    }
  }

  console.log(
    `Backfill complete. ${processed} bookings processed. ${mutated} ${
      options.dryRun ? "would be updated (dry run)." : "updated."
    }`,
  )
}

run()
  .then(() => {
    if (!options.dryRun) {
      console.log("All done!")
    }
    process.exit(0)
  })
  .catch((error) => {
    console.error("Backfill failed", error)
    process.exit(1)
  })
