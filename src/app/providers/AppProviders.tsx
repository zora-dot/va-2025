import { RouterProvider, type AnyRouter } from "@tanstack/react-router"
import {
  QueryClient,
  QueryClientProvider,
  type DefaultOptions,
} from "@tanstack/react-query"
import { type PropsWithChildren, useState } from "react"
import { FirebaseProvider, useFirebaseServices } from "@/app/providers/FirebaseContext"
import { AuthProvider, useAuthContext } from "@/app/providers/AuthProvider"
import { ToastProvider } from "@/components/ui/ToastProvider"

const queryClientOptions: DefaultOptions = {
  queries: {
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 60_000,
  },
}

type AppProvidersProps = PropsWithChildren<{
  router: AnyRouter
}>

export const AppProviders = ({ router }: AppProvidersProps) => {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: queryClientOptions }),
  )

  return (
    <FirebaseProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <RouterBridge router={router} />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </FirebaseProvider>
  )
}

const RouterBridge = ({ router }: { router: AnyRouter }) => {
  const auth = useAuthContext()
  const firebase = useFirebaseServices()

  return <RouterProvider router={router} context={{ auth, firebase }} />
}
