import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  apiUrl,
  authenticatedFetch,
  supabase,
  isSupabaseConfigured,
} from "./supabase";

const AuthContext = createContext(null);

/*
|--------------------------------------------------------------------------
| Roles
|--------------------------------------------------------------------------
*/

const VALID_ROLES = new Set([
  "citizen",
  "hospital",
  "ambulance",
  "resource_provider",
  "coordinator",
  "admin",
]);

const PROVIDER_ROLES = new Set([
  "hospital",
  "ambulance",
  "resource_provider",
]);

const TOKEN_REFRESH_BUFFER_SECONDS = 120;

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizeRole(value) {
  const role = String(value || "")
    .trim()
    .toLowerCase();

  return VALID_ROLES.has(role)
    ? role
    : null;
}

function getRequestedRole(user) {
  const metadata =
    user?.user_metadata || {};

  return (
    normalizeRole(
      metadata.lifegrid_role_request
    ) || "citizen"
  );
}

/*
|--------------------------------------------------------------------------
| IMPORTANT SECURITY RULE
|--------------------------------------------------------------------------
|
| user_metadata NEVER grants privileged access.
|
| Backend /auth/me is the primary authority.
| Supabase app_metadata is secondary.
|
*/

function getPrivilegedRole(
  user,
  backendProfile
) {
  const backendRole =
    normalizeRole(
      backendProfile?.role
    );

  if (backendRole) {
    return backendRole;
  }

  const appRole =
    normalizeRole(
      user?.app_metadata?.role
    );

  if (appRole) {
    return appRole;
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| Provider
|--------------------------------------------------------------------------
*/

export function AuthProvider({
  children,
}) {
  const [session, setSession] =
    useState(null);

  const [profile, setProfile] =
    useState(null);

  const [onboarding, setOnboarding] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [authError, setAuthError] =
    useState("");

  const mountedRef =
    useRef(false);

  const loadPromiseRef =
    useRef(null);

  const refreshPromiseRef =
    useRef(null);

  /*
  |--------------------------------------------------------------------------
  | Clear backend state
  |--------------------------------------------------------------------------
  */

  function clearBackendState() {
    if (!mountedRef.current) {
      return;
    }

    setProfile(null);
    setOnboarding(null);
  }

  /*
  |--------------------------------------------------------------------------
  | Clear complete authentication state
  |--------------------------------------------------------------------------
  */

  function clearAuthState() {
    if (!mountedRef.current) {
      return;
    }

    setSession(null);
    setProfile(null);
    setOnboarding(null);
    setAuthError("");
  }

  /*
  |--------------------------------------------------------------------------
  | Get valid session
  |--------------------------------------------------------------------------
  */

  async function getValidSession() {
    if (!supabase) return null;
    const {
      data,
      error,
    } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    let currentSession =
      data?.session || null;

    if (!currentSession) {
      return null;
    }

    const expiresAt =
      Number(
        currentSession.expires_at || 0
      );

    const now =
      Math.floor(
        Date.now() / 1000
      );

    const remaining =
      expiresAt - now;

    if (
      !expiresAt ||
      remaining <=
        TOKEN_REFRESH_BUFFER_SECONDS
    ) {
      if (
        !refreshPromiseRef.current
      ) {
        refreshPromiseRef.current =
          supabase.auth
            .refreshSession()
            .finally(() => {
              refreshPromiseRef.current =
                null;
            });
      }

      const {
        data: refreshed,
        error: refreshError,
      } =
        await refreshPromiseRef.current;

      if (refreshError) {
        throw refreshError;
      }

      currentSession =
        refreshed?.session || null;
    }

    return currentSession;
  }

  /*
  |--------------------------------------------------------------------------
  | Authenticated backend request
  |--------------------------------------------------------------------------
  */

  async function backendFetch(
    endpoint,
    options = {},
    retry = true
  ) {
    const currentSession =
      await getValidSession();

    if (
      !currentSession?.access_token
    ) {
      const error =
        new Error(
          "No active LIFEGRID session."
        );

      error.code = "NO_SESSION";

      throw error;
    }

    const response =
      await authenticatedFetch(
        apiUrl(endpoint),
        options
      );

    /*
     * Retry a single time if backend rejected
     * an expired Supabase token.
     */

    if (
      response.status === 401 &&
      retry
    ) {
      if (
        !refreshPromiseRef.current
      ) {
        refreshPromiseRef.current =
          supabase.auth
            .refreshSession()
            .finally(() => {
              refreshPromiseRef.current =
                null;
            });
      }

      const {
        data,
        error,
      } =
        await refreshPromiseRef.current;

      if (
        error ||
        !data?.session
      ) {
        throw new Error(
          "Your LIFEGRID session has expired. Please sign in again."
        );
      }

      if (mountedRef.current) {
        setSession(data.session);
      }

      return backendFetch(
        endpoint,
        options,
        false
      );
    }

    return response;
  }

  /*
  |--------------------------------------------------------------------------
  | Load backend role + onboarding
  |--------------------------------------------------------------------------
  */

  async function loadAuthState(
    nextSession
  ) {
    if (
      !nextSession?.access_token
    ) {
      clearBackendState();
      return false;
    }

    if (loadPromiseRef.current) {
      return loadPromiseRef.current;
    }

    loadPromiseRef.current =
      (async () => {
        try {
          setAuthError("");

          const [
            profileResponse,
            onboardingResponse,
          ] = await Promise.all([
            backendFetch(
              "/auth/me"
            ),
            backendFetch(
              "/auth/onboarding/status"
            ),
          ]);

          /*
          |--------------------------------------------------------------------------
          | /auth/me
          |--------------------------------------------------------------------------
          */

          if (!profileResponse.ok) {
            let detail = "";

            try {
              const body =
                await profileResponse.json();

              detail =
                body?.detail || "";
            } catch {
              // Ignore invalid response.
            }

            throw new Error(
              detail ||
                `Authentication service returned ${profileResponse.status}.`
            );
          }

          const profileData =
            await profileResponse.json();

          if (mountedRef.current) {
            setProfile(
              profileData || null
            );
          }

          /*
          |--------------------------------------------------------------------------
          | onboarding/status
          |--------------------------------------------------------------------------
          */

          if (
            onboardingResponse.ok
          ) {
            const onboardingData =
              await onboardingResponse.json();

            if (mountedRef.current) {
              setOnboarding(
                onboardingData || null
              );
            }
          } else if (
            onboardingResponse.status ===
            404
          ) {
            /*
             * Older backend:
             * onboarding endpoint absent.
             */

            if (mountedRef.current) {
              setOnboarding(null);
            }
          } else {
            /*
             * Onboarding is supplementary.
             */

            if (mountedRef.current) {
              setOnboarding(null);
            }
          }

          return true;
        } catch (error) {
          console.error(
            "LIFEGRID auth state error:",
            error
          );

          if (mountedRef.current) {
            setProfile(null);
            setOnboarding(null);

            setAuthError(
              error?.message ||
                "Unable to verify LIFEGRID access."
            );
          }

          /*
           * IMPORTANT:
           * Do not sign the user out just because
           * the backend temporarily failed.
           */

          return false;
        } finally {
          loadPromiseRef.current =
            null;
        }
      })();

    return loadPromiseRef.current;
  }

  /*
  |--------------------------------------------------------------------------
  | Initial authentication
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    mountedRef.current = true;

    if (!isSupabaseConfigured || !supabase) {
      setAuthError(
        "Supabase is not configured. Create web/.env with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
      );
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    let cancelled = false;

    async function initialize() {
      try {
        setLoading(true);

        const nextSession =
          await getValidSession();

        if (
          cancelled ||
          !mountedRef.current
        ) {
          return;
        }

        if (!nextSession) {
          clearAuthState();
          return;
        }

        setSession(nextSession);

        await loadAuthState(
          nextSession
        );
      } catch (error) {
        console.error(
          "LIFEGRID initialization error:",
          error
        );

        if (
          mountedRef.current &&
          !cancelled
        ) {
          setAuthError(
            error?.message ||
              "Unable to initialize LIFEGRID."
          );

          /*
           * Preserve an existing valid Supabase
           * session even when backend lookup fails.
           */

          try {
            const {
              data,
            } =
              await supabase.auth.getSession();

            if (data?.session) {
              setSession(
                data.session
              );
            } else {
              clearAuthState();
            }
          } catch {
            // Keep current UI state.
          }
        }
      } finally {
        if (
          mountedRef.current &&
          !cancelled
        ) {
          setLoading(false);
        }
      }
    }

    void initialize();

    /*
    |--------------------------------------------------------------------------
    | Supabase auth listener
    |--------------------------------------------------------------------------
    */

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          event,
          nextSession
        ) => {
          if (
            cancelled ||
            !mountedRef.current
          ) {
            return;
          }

          if (
            event ===
            "SIGNED_OUT"
          ) {
            clearAuthState();
            setLoading(false);
            return;
          }

          if (!nextSession) {
            clearAuthState();
            setLoading(false);
            return;
          }

          setSession(nextSession);
          setLoading(true);

          /*
           * Do backend work outside the
           * Supabase auth callback.
           */

          window.setTimeout(
            () => {
              if (
                cancelled ||
                !mountedRef.current
              ) {
                return;
              }

              void loadAuthState(
                nextSession
              ).finally(() => {
                if (
                  mountedRef.current &&
                  !cancelled
                ) {
                  setLoading(false);
                }
              });
            },
            0
          );
        }
      );

    return () => {
      cancelled = true;
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Derived state
  |--------------------------------------------------------------------------
  */

  const user =
    session?.user || null;

  const role =
    getPrivilegedRole(
      user,
      profile
    );

  const requestedRole =
    getRequestedRole(user);

  const providerStatus =
    String(
      onboarding?.status ||
        user?.user_metadata
          ?.registration_status ||
        ""
    )
      .trim()
      .toLowerCase() || null;

  const providerPending =
    PROVIDER_ROLES.has(
      requestedRole
    ) &&
    role === "citizen" &&
    providerStatus !== "approved";

  /*
  |--------------------------------------------------------------------------
  | Manual refresh
  |--------------------------------------------------------------------------
  */

  async function refreshAuth() {
    if (!supabase) {
      setAuthError(
        "Supabase is not configured. Add the required web/.env values first."
      );
      return null;
    }

    try {
      setLoading(true);
      setAuthError("");

      const {
        data,
        error,
      } =
        await supabase.auth.refreshSession();

      if (error) {
        throw error;
      }

      if (!data?.session) {
        clearAuthState();
        return null;
      }

      if (mountedRef.current) {
        setSession(
          data.session
        );
      }

      await loadAuthState(
        data.session
      );

      return data.session;
    } catch (error) {
      console.error(
        "LIFEGRID refresh error:",
        error
      );

      if (mountedRef.current) {
        setAuthError(
          error?.message ||
            "Unable to refresh authentication."
        );
      }

      throw error;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Sign out
  |--------------------------------------------------------------------------
  */

  async function signOut() {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      clearAuthState();
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Context
  |--------------------------------------------------------------------------
  */

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      onboarding,

      role,
      requestedRole,
      providerStatus,
      providerPending,

      loading,
      authError,

      refreshAuth,
      signOut,

      authenticatedFetch:
        backendFetch,
    }),
    [
      session,
      user,
      profile,
      onboarding,
      role,
      requestedRole,
      providerStatus,
      providerPending,
      loading,
      authError,
    ]
  );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useAuth() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider."
    );
  }

  return context;
}