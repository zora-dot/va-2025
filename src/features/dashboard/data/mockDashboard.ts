export const customerDashboardData = {
  loyaltyTier: "Skyline Elite",
  availableCredits: 120,
  nextTrip: {
    id: "VA-48321",
    pickup: "Sat • 05:15 AM",
    route: "Chilliwack → Vancouver International Airport (YVR)",
    driver: "Matt L.",
    vehicle: "Mercedes Sprinter • VAN-12",
    status: "On Track",
  },
  upcomingTrips: [
    {
      id: "VA-48321",
      date: "Sat • Mar 22",
      from: "Chilliwack",
      to: "Vancouver International Airport",
      passengers: 3,
      status: "Confirmed",
    },
    {
      id: "VA-48321-R",
      date: "Sun • Mar 24",
      from: "Vancouver International Airport",
      to: "Chilliwack",
      passengers: 3,
      status: "Pending",
    },
  ],
  stats: [
    { label: "Trips This Year", value: "14" },
    { label: "On-Time Arrival", value: "100%" },
    { label: "Messages", value: "2 Open" },
  ],
}

export const driverDashboardData = {
  shift: {
    start: "04:30 AM",
    end: "01:30 PM",
    vehicle: "VAN-12",
    odometer: "78,230 km",
  },
  nextAssignment: {
    bookingId: "VA-48321",
    pickupWindow: "05:10 – 05:15 AM",
    passengers: 3,
    route: "Chilliwack → Vancouver International Airport",
    specialNotes: "Ski baggage – allow extra loading time.",
  },
  assignments: [
    {
      id: "VA-48321",
      time: "05:00",
      status: "En Route",
      route: "Chilliwack → YVR",
    },
    {
      id: "VA-47618",
      time: "09:45",
      status: "Assigned",
      route: "Abbotsford East → YXX",
    },
    {
      id: "VA-47002",
      time: "12:10",
      status: "Standby",
      route: "Mission → Guildford",
    },
  ],
  stats: [
    { label: "On-Time Score", value: "98%" },
    { label: "Safety Check", value: "Complete" },
    { label: "Customer Rating", value: "4.9 ★" },
  ],
}

export const adminDashboardData = {
  metrics: [
    {
      label: "Revenue (Today)",
      value: "$8,420",
      delta: "+12.4%",
    },
    {
      label: "Active Trips",
      value: "7",
      delta: "+2 vs avg",
    },
    {
      label: "Support Queue",
      value: "3",
      delta: "1 escalated",
    },
    {
      label: "Fleet Availability",
      value: "12 / 14",
      delta: "+1 returning",
    },
  ],
  scheduleHighlights: [
    {
      time: "05:15",
      title: "Chilliwack → YVR",
      driver: "Matt L.",
      status: "En Route",
    },
    {
      time: "06:20",
      title: "Langley → YXX",
      driver: "Priya N.",
      status: "Awaiting Pickup",
    },
    {
      time: "07:10",
      title: "Downtown → YVR",
      driver: "Jordan A.",
      status: "Delayed",
    },
  ],
  alerts: [
    {
      title: "Flight Delay AC 817",
      detail: "Pickup shifted +45m • Customer notified",
      level: "warning",
    },
    {
      title: "Vehicle VAN-8 Maintenance",
      detail: "Scheduled detailing 14:00 • Garage",
      level: "info",
    },
    {
      title: "Dispatch Coverage",
      detail: "Night shift understaffed – reassigning",
      level: "danger",
    },
  ],
}
