import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { RoleGate } from "@/components/layout/RoleGate"
import { RefreshCw, FileText } from "lucide-react"
import { format } from "date-fns"
import { useCustomerDocuments } from "@/features/customers/hooks"
import { useToast } from "@/components/ui/ToastProvider"

export const CustomerDocumentsPage = () => {
  const { documents, loading, uploading, error, uploadDocument, refresh } = useCustomerDocuments()
  const { present } = useToast()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const profileBlocked = error?.message === "PROFILE_INCOMPLETE"

  const handleSelectFile: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0]
    setSelectedFile(file ?? null)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
     if (profileBlocked) {
      present({
        title: "Profile update required",
        description: "Complete your profile before uploading documents.",
        tone: "warning",
      })
      return
    }
    try {
      await uploadDocument(selectedFile)
      setSelectedFile(null)
      present({
        title: "Upload complete",
        description: `${selectedFile.name} is now stored securely.`,
        tone: "success",
      })
    } catch (uploadError) {
      console.error(uploadError)
      present({
        title: "Upload failed",
        description:
          uploadError instanceof Error
            ? uploadError.message
            : "We couldn’t upload that file. Please try again.",
        tone: "danger",
      })
    }
  }

  return (
    <RoleGate
      allowedRoles={["customer", "admin"]}
      headline="Documents & preferences"
      description="Keep your travel paperwork and account details organized in one place."
    >
      <section className="flex flex-col gap-6 pb-24">
        <GlassPanel className="p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Account docs</p>
              <h2 className="font-heading text-xl uppercase tracking-[0.32em] text-horizon">
                Secure storage
              </h2>
            </div>
            <Link to="/portal/customer" className="va-button va-button--subtle px-5 py-[0.6rem] text-xs">
              Back to dashboard
            </Link>
          </header>
          <p className="mt-2 text-sm text-midnight/70">
            Upload or update files ahead of your trip so dispatch can verify everything without follow-up emails. Files stay encrypted and you can purge them anytime.
          </p>
          {profileBlocked ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>
                Uploads unlock once your account has a confirmed phone number and access request. This keeps sensitive files tied to verified contacts.
              </p>
              <Link
                to="/auth/profile?redirect=/portal/customer/documents"
                className="va-button va-button--secondary inline-flex px-4 py-[0.55rem] text-xs"
              >
                Complete profile
              </Link>
            </div>
          ) : error ? (
            <p className="mt-4 text-xs text-amber-600">
              We couldn’t load your documents. Refresh to try again.
            </p>
          ) : null}
        </GlassPanel>

        {profileBlocked ? (
          <GlassPanel className="p-6 text-sm text-midnight/70">
            <p>
              Once your profile is complete, you’ll be able to upload passports, IDs, or consent forms securely.
              Complete your profile to proceed.
            </p>
          </GlassPanel>
        ) : (
          <>
            <GlassPanel className="flex flex-col gap-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Upload document</p>
                  <h3 className="font-heading text-base uppercase tracking-[0.28em] text-horizon">
                    Add a new file
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="va-button va-button--subtle cursor-pointer px-4 py-[0.55rem] text-xs">
                    Choose file
                    <input
                      type="file"
                      className="sr-only"
                      onChange={handleSelectFile}
                      accept=".pdf,.jpg,.jpeg,.png"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!selectedFile || uploading}
                    onClick={handleUpload}
                    className="va-button va-button--secondary px-4 py-[0.55rem] text-xs"
                  >
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                  <button
                    type="button"
                    onClick={() => refresh()}
                    disabled={loading || uploading}
                    className="va-button va-button--ghost inline-flex items-center gap-2 px-4 py-[0.55rem] text-xs disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    Refresh
                  </button>
                </div>
              </div>
              {selectedFile ? (
                <p className="text-xs text-midnight/60">
                  Selected file: <strong>{selectedFile.name}</strong> ({Math.round(selectedFile.size / 1024)} KB)
                </p>
              ) : (
                <p className="text-xs text-midnight/60">
                  Accepted formats: PDF, JPG, PNG. Maximum size depends on your upload policy.
                </p>
              )}
            </GlassPanel>

            <GlassPanel className="p-6">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-horizon/70">Stored files</p>
                  <h3 className="font-heading text-base uppercase tracking-[0.28em] text-horizon">
                    Document library
                  </h3>
                </div>
                <div className="va-chip bg-white/80 text-midnight/70">
                  {loading ? "Loading…" : `${documents.length} file${documents.length === 1 ? "" : "s"}`}
                </div>
              </header>
              {loading ? (
                <p className="mt-4 text-sm text-midnight/70">Loading your documents…</p>
              ) : documents.length === 0 ? (
                <div className="mt-6 flex flex-col items-center gap-2 text-sm text-midnight/70">
                  <FileText className="h-10 w-10 text-horizon/60" aria-hidden />
                  <p>No documents uploaded yet.</p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.3em] text-midnight/50">
                        <th className="px-3 py-2">Filename</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Uploaded</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr key={doc.id} className="rounded-xl bg-white/85 text-midnight/80 shadow-sm">
                          <td className="px-3 py-3">
                            <div className="flex flex-col">
                              <span className="font-semibold text-midnight/90">{doc.filename}</span>
                              {doc.id !== doc.filename ? (
                                <span className="text-xs text-midnight/60">ID: {doc.id}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs text-midnight/60">{doc.contentType ?? "—"}</td>
                          <td className="px-3 py-3 text-xs text-midnight/60">
                            {doc.sizeBytes != null ? `${Math.round(doc.sizeBytes / 1024)} KB` : "—"}
                          </td>
                          <td className="px-3 py-3 text-xs text-midnight/60">
                            {doc.uploadedAt ? format(new Date(doc.uploadedAt), "MMM d, yyyy • h:mm a") : "—"}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {doc.downloadUrl ? (
                              <a
                                href={doc.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="va-button va-button--subtle px-4 py-[0.45rem]"
                              >
                                Download
                              </a>
                            ) : (
                              <span className="text-midnight/40">Not available</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassPanel>
          </>
        )}
      </section>
    </RoleGate>
  )
}
