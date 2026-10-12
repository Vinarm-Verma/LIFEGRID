import {
  LogOut,
  ShieldCheck,
} from "lucide-react";

import {
  useAuth,
} from "../auth/AuthContext";

import CoordinatorApprovalCenter from "./CoordinatorApprovalCenter";

export default function AdminDashboard() {
  const {
    user,
    role,
    signOut,
  } = useAuth();

  const isAdmin =
    role === "admin" ||
    role === "coordinator";

  if (!isAdmin) {
    return null;
  }

  return (
    <main className="lifegrid-admin-page">
      <header
        className="lifegrid-admin-header"
        style={{
          minHeight: 72,
          padding:
            "12px 24px",
          display:
            "flex",
          alignItems:
            "center",
          justifyContent:
            "space-between",
          gap: 16,
          background:
            "#ffffff",
          borderBottom:
            "1px solid #dce7ed",
        }}
      >
        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              display:
                "grid",
              placeItems:
                "center",
              borderRadius:
                11,
              background:
                "#eaf6f3",
              color:
                "#168b78",
            }}
          >
            <ShieldCheck
              size={22}
            />
          </div>

          <div>
            <strong
              style={{
                display:
                  "block",
                fontSize: 17,
                color:
                  "#17324d",
              }}
            >
              LIFEGRID
            </strong>

            <span
              style={{
                color:
                  "#708594",
                fontSize: 12,
              }}
            >
              Provider Access Administration
            </span>
          </div>
        </div>

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap: 12,
          }}
        >
          <div
            style={{
              display:
                "flex",
              flexDirection:
                "column",
              alignItems:
                "flex-end",
            }}
          >
            <strong
              style={{
                fontSize: 12,
                color:
                  "#17324d",
              }}
            >
              {role === "admin"
                ? "ADMIN"
                : "COORDINATOR"}
            </strong>

            <span
              style={{
                maxWidth: 220,
                overflow:
                  "hidden",
                textOverflow:
                  "ellipsis",
                whiteSpace:
                  "nowrap",
                color:
                  "#708594",
                fontSize: 11,
              }}
            >
              {user?.email ||
                "Authenticated"}
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              void signOut()
            }
            style={{
              display:
                "inline-flex",
              alignItems:
                "center",
              gap: 7,
              minHeight: 40,
              padding:
                "0 13px",
              border:
                "1px solid #cbd9e1",
              borderRadius: 9,
              background:
                "#fff",
              color:
                "#17324d",
              fontWeight: 750,
              cursor:
                "pointer",
            }}
          >
            <LogOut
              size={16}
            />
            Sign out
          </button>
        </div>
      </header>

      <div
        style={{
          minHeight:
            "calc(100vh - 72px)",
          background:
            "#f4f8fa",
          padding:
            "28px 18px 50px",
        }}
      >
        <div
          style={{
            maxWidth: 1250,
            margin:
              "0 auto",
          }}
        >
          <section
            style={{
              marginBottom: 20,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing:
                  ".13em",
                color:
                  "#168b78",
              }}
            >
              PROVIDER NETWORK ADMINISTRATION
            </span>

            <h1
              style={{
                margin:
                  "6px 0 8px",
                color:
                  "#17324d",
                fontSize:
                  "clamp(28px, 4vw, 40px)",
                lineHeight:
                  1.1,
              }}
            >
              Provider access
            </h1>

            <p
              style={{
                maxWidth: 780,
                margin: 0,
                color:
                  "#607589",
                lineHeight:
                  1.6,
              }}
            >
              Approve and reject provider
              registrations. Emergency
              operations stay inside the
              Citizen → Hospital → Ambulance
              → Hospital workflow.
            </p>
          </section>

          <section
            style={{
              marginBottom: 18,
              padding:
                "14px 16px",
              display:
                "flex",
              alignItems:
                "flex-start",
              gap: 10,
              border:
                "1px solid #cfe3df",
              borderRadius:
                12,
              background:
                "#f0faf7",
              color:
                "#28665c",
              fontSize: 13,
              lineHeight:
                1.55,
            }}
          >
            <ShieldCheck
              size={18}
              style={{
                flexShrink: 0,
              }}
            />

            <span>
              This dashboard intentionally
              contains no emergency queue,
              ambulance dispatch or hospital
              coordination controls.
            </span>
          </section>

          <section
            style={{
              overflow:
                "hidden",
              border:
                "1px solid #dce7ed",
              borderRadius:
                16,
              background:
                "#ffffff",
              boxShadow:
                "0 8px 28px rgba(30,58,78,.06)",
            }}
          >
            <CoordinatorApprovalCenter />
          </section>
        </div>
      </div>
    </main>
  );
}