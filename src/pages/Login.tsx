import { useAuth } from "@/lib/auth"

export function Login() {
  const { signInWithGitHub, loading } = useAuth()

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "hsl(var(--background))",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          padding: 48,
          borderRadius: 16,
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          minWidth: 320,
        }}
      >
        {/* Logo / Title */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "hsl(var(--foreground))",
              letterSpacing: "-0.02em",
            }}
          >
            CRVN
          </div>
          <div
            style={{
              fontSize: 12,
              color: "hsl(var(--muted-foreground))",
              marginTop: 4,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Gacha Tracker
          </div>
        </div>

        {/* GitHub login button */}
        <button
          onClick={signInWithGitHub}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 24px",
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "background 150ms ease, border-color 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "hsl(var(--accent))"
            e.currentTarget.style.borderColor = "hsl(var(--foreground))"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "hsl(var(--background))"
            e.currentTarget.style.borderColor = "hsl(var(--border))"
          }}
        >
          {/* GitHub icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Sign in with GitHub
        </button>

        <div
          style={{
            fontSize: 11,
            color: "hsl(var(--muted-foreground))",
            textAlign: "center",
            maxWidth: 240,
            lineHeight: 1.5,
          }}
        >
          Personal tracker. Authorized access only.
        </div>
      </div>
    </div>
  )
}
