import {
  Alert,
  Bullseye,
  Button,
  Content,
  Divider,
  HelperText,
  HelperTextItem,
  LoginForm,
  LoginPage,
} from '@patternfly/react-core'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { useAlerts } from '../components/alerts'
import { LoadingState } from '../components/states/LoadingState'
import { useAuthStore, selectIsAuthenticated, selectIsRefreshing, selectAuthError } from '../stores/useAuthStore'

import { IdentityProviderButtons } from './IdentityProviderButtons'
import { useAuthProviders } from './useAuthProviders'

type LocalLoginFormProps = {
  username: string
  password: string
  loginError: string | null
  isLoggingIn: boolean
  loginButtonLabel: string
  onChangeUsername: (value: string) => void
  onChangePassword: (value: string) => void
  onClearError: () => void
  onLogin: (e: React.MouseEvent<HTMLButtonElement>) => void
}

function LocalLoginForm({
  username,
  password,
  loginError,
  isLoggingIn,
  loginButtonLabel,
  onChangeUsername,
  onChangePassword,
  onClearError,
  onLogin,
}: Readonly<LocalLoginFormProps>) {
  return (
    <LoginForm
      usernameLabel="Username"
      usernameValue={username}
      onChangeUsername={(_e, val) => {
        onChangeUsername(val)
        onClearError()
      }}
      passwordLabel="Password"
      passwordValue={password}
      onChangePassword={(_e, val) => {
        onChangePassword(val)
        onClearError()
      }}
      showHelperText={loginError !== null}
      helperText={loginError}
      isShowPasswordEnabled
      loginButtonLabel={loginButtonLabel}
      isLoginButtonDisabled={!username || !password || isLoggingIn}
      onLoginButtonClick={onLogin}
    />
  )
}

const toggleLinkStyle: React.CSSProperties = { textDecoration: 'underline', textDecorationStyle: 'dashed' }

export function AppLogin(props: { children?: ReactNode }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const logoutCount = useAuthStore((s) => s.logoutCount)

  if (isAuthenticated) {
    return props.children
  }

  return <AppLoginForm key={logoutCount} />
}

function AppLoginForm() {
  const isRefreshing = useAuthStore(selectIsRefreshing)
  const error = useAuthStore(selectAuthError)
  const login = useAuthStore((s) => s.login)
  const refresh = useAuthStore((s) => s.refresh)
  const { showError } = useAlerts()
  const [bootstrapDone, setBootstrapDone] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(() => {
    const params = new URLSearchParams(globalThis.location.search)
    const authError = params.get('auth_error')
    if (authError) {
      // Clean up the URL so the error doesn't persist on refresh.
      // replaceState is a browser API (not React state), so calling it
      // in the initializer is safe and avoids an extra render cycle.
      globalThis.history.replaceState({}, '', globalThis.location.pathname)
    }
    return authError
  })
  const [showLocalLogin, setShowLocalLogin] = useState(false)
  const bootstrapAttempted = useRef(false)

  const { providers, isLoading: providersLoading } = useAuthProviders()
  const hasProviders = providers.length > 0

  // On mount, try a silent refresh from the HttpOnly cookie
  useEffect(() => {
    if (useAuthStore.getState().isAuthenticated || bootstrapAttempted.current) return
    bootstrapAttempted.current = true

    let cancelled = false

    async function bootstrapAuthFromCookie(): Promise<void> {
      try {
        await refresh()
      } catch {
        // No valid cookie — user needs to enter credentials
        useAuthStore.setState({ error: null })
      } finally {
        if (!cancelled) {
          setBootstrapDone(true)
        }
      }
    }

    // Completion and errors are handled inside bootstrapAuthFromCookie (not detached / not reportError-only).
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- intentional fire-and-forget from sync useEffect
    bootstrapAuthFromCookie()

    return () => {
      cancelled = true
      // Strict Mode remount (or `[refresh]` identity change) must be allowed to run bootstrap again;
      // otherwise `bootstrapDone` never flips and the login shell spins forever.
      bootstrapAttempted.current = false
    }
  }, [refresh])

  useEffect(() => {
    if (error && bootstrapDone) {
      showError({ title: 'Authentication failed', description: error })
    }
  }, [error, bootstrapDone, showError])

  const handleLogin = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      if (!username || !password) return
      setLoginError(null)
      setIsLoggingIn(true)
      login({ username, password }).catch((err: unknown) => {
        setIsLoggingIn(false)
        setLoginError(err instanceof Error ? err.message : 'Invalid username or password')
      })
    },
    [username, password, login]
  )

  const clearError = useCallback(() => setLoginError(null), [])

  const localFormProps: LocalLoginFormProps = {
    username,
    password,
    loginError,
    isLoggingIn,
    loginButtonLabel: hasProviders ? 'Log in as administrator' : 'Log in',
    onChangeUsername: setUsername,
    onChangePassword: setPassword,
    onClearError: clearError,
    onLogin: handleLogin,
  }

  if (!bootstrapDone || isRefreshing || providersLoading) {
    return (
      <Bullseye style={{ height: '100vh' }}>
        <LoadingState />
      </Bullseye>
    )
  }

  // State A: No IDPs — show original login form
  if (!hasProviders) {
    return (
      <LoginPage
        className="bg-deep-space-login"
        loginTitle="Log in to Automation Orchestrator"
        loginSubtitle="Enter your credentials to continue"
      >
        <LocalLoginForm {...localFormProps} />
      </LoginPage>
    )
  }

  // State B/C: IDPs exist
  return (
    <LoginPage
      className="bg-deep-space-login"
      loginTitle="Log in to Automation Orchestrator"
      loginSubtitle="Choose your identity provider"
      textContent="Select your identity provider to access Automation Orchestrator. Contact your administrator if you need assistance."
    >
      {loginError && (
        <Alert
          variant="danger"
          title={
            loginError.toLowerCase().includes('log out') ? 'Identity provider sign-out failed' : 'Authentication failed'
          }
          isInline
          style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}
        >
          {loginError}
        </Alert>
      )}

      <IdentityProviderButtons providers={providers} />

      {showLocalLogin ? (
        <>
          <Divider
            style={{ marginTop: 'var(--pf-t--global--spacer--lg)', marginBottom: 'var(--pf-t--global--spacer--lg)' }}
          />
          <HelperText style={{ marginBottom: 'var(--pf-t--global--spacer--md)' }}>
            <HelperTextItem>
              For local account access only. Other users should sign in using the identity provider above.
            </HelperTextItem>
          </HelperText>
          <LocalLoginForm {...localFormProps} />
          <Content style={{ marginTop: 'var(--pf-t--global--spacer--md)', textAlign: 'center' }}>
            <Button variant="link" onClick={() => setShowLocalLogin(false)} style={toggleLinkStyle}>
              Hide local account login
            </Button>
          </Content>
        </>
      ) : (
        <Content style={{ marginTop: 'var(--pf-t--global--spacer--lg)', textAlign: 'center' }}>
          <Button variant="link" onClick={() => setShowLocalLogin(true)} style={toggleLinkStyle}>
            Sign in using local account
          </Button>
        </Content>
      )}
    </LoginPage>
  )
}
