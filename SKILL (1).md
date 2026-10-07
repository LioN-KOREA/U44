---
name: lionkorea-auth-integration
description: "Integrate an application with the 라이온코리아 IT 서비스 계정관리 시스템 (Lion Korea IT account management and authentication system). Use when adding sign-in, session refresh, sign-out, access-token verification, CORS/app-client configuration, or authority-based access control to an app that authenticates against this system — including whenever the work mentions an app client id, a /lpx/auth endpoint, a secToken, an authority id, or the 앱 클라이언트 관리 console. It covers both the browser side (login screen, token lifecycle) and the server side (JWT verification against JWKS, authority checks). It is not a general OAuth2/OIDC guide and does not apply to other identity providers."
---

# Integrating with the 라이온코리아 계정관리 시스템

This system issues JWTs. An integrating app verifies them **locally** against a public JWKS
document, so the app needs no AWS credentials, no AWS SDK, and need not run on AWS.

`reference.md`, in this folder, is the full integration guide: exact request and response shapes,
every status code, proxy configuration, and worked code. Read it before writing integration code.
It is the same document the console offers as 연동 안내서 under 앱 클라이언트 관리.

## Collect these four values first

Do not guess them, and do not invent placeholder values that look real. If any is missing, ask the
user to get it from an administrator — the console shows all four under 앱 클라이언트 관리 → the
client → 연동 정보.

| Value | Used for |
| --- | --- |
| Auth base URL | Every endpoint below is relative to it |
| App client id | The `clientId` query parameter, and the `client_id` claim check |
| Cognito user pool id | Builds the JWKS URL; its prefix before `_` is the region |
| Authority id | The permission the app's routes check |

Also confirm the app's origins (production, staging, `http://localhost:…`) are registered on the
app client, or every browser call fails with `403` before anything else can work.

## Workflow

1. Read `reference.md`.
2. Confirm the four values and the registered origins.
3. Decide the topology: same-origin reverse proxy (recommended) or cross-origin. Same-origin lets
   the refresh cookie stay `SameSite=Lax`; cross-origin requires the administrator to enable
   다른 도메인에서 토큰 갱신 허용 on the app client.
4. Build the login screen and the token lifecycle (login → refresh → logout).
5. Build the server-side guard: verify the token, then check the authority.
6. Walk the integration checklist at the end of `reference.md`.

## Endpoints

All take `?clientId=<APP_CLIENT_ID>`; all responses are `{ status, message, data }`.

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/lpx/auth/login` | — |
| `POST` | `/lpx/auth/token` | refresh cookie + `X-Sec-Token` |
| `DELETE` | `/lpx/auth/token` | refresh cookie + `X-Sec-Token` |
| `GET` | `/lpx/auth/userInfo` | `Authorization: Bearer` |
| `POST` | `/lpx/auth/ss/userinfo` | `Authorization: Bearer` |
| `POST` | `/lpx/auth/ss/password` | `Authorization: Bearer` |

## Rules that are easy to get wrong

These are the mistakes that produce a working-looking integration that fails later.

**Tokens and the session**

- Set `credentials: "include"` on login, refresh **and** logout. Without it the refresh cookie is
  never stored or never sent, and refresh fails with `400` even though login succeeded.
- Keep `accessToken`, `idToken` and `secToken` in memory only. Never `localStorage` or
  `sessionStorage` — anything there is readable by any XSS on the page.
- Every refresh rotates the refresh token **and** the `secToken`. Store the new `secToken` from
  each response; reusing the old one fails.
- A `403` from refresh means the session was revoked (a rotated-away token was replayed, or the
  cookie and header did not match). Sign the user out. Do not retry.
- Never move the `secToken` into a cookie. It is deliberately the half of the pair that only
  JavaScript can set, which is what defeats CSRF on the refresh endpoint.

**Verifying the token on the server**

- Verify every request's token against the JWKS URL
  `https://cognito-idp.<REGION>.amazonaws.com/<USER_POOL_ID>/.well-known/jwks.json`, cached.
  Use `aws-jwt-verify` on Node, or `jose` with `createRemoteJWKSet()` anywhere else.
- Assert all four: signature, `iss`, `token_use === "access"`, and `client_id === <APP_CLIENT_ID>`.
- A successful `/lpx/auth/userInfo` response is **not** proof the token is valid for this app.
  Verify the signature yourself.
- `username` is not the email in this pool. Use `sub` as the stable user key, and read the email
  from `/lpx/auth/userInfo`.
- `cognito:groups` is stripped from the tokens; the role is in the `role` claim.

**Authorities**

- Gate on the **authority id**, never on the `role` claim. Role ids change when an administrator
  reorganises roles; authority ids are the stable contract.
- The access token does not carry the authority list. Read it from `/lpx/auth/userInfo` and cache
  it per `sub` (or per role) for about 60 seconds. That TTL is the revocation lag.
- Never cache a failed authority lookup. A transient error would otherwise lock users out for the
  whole TTL and look exactly like a permissions problem.
- Enforce on the server. Hiding UI is presentation, not access control.

**CORS and proxying**

- Origins are matched exactly: scheme, host and port, with no trailing slash and no wildcard.
- Browsers send `Origin` on same-origin `POST`/`PUT`/`DELETE` too, so the app's own origin must be
  registered even behind a reverse proxy. The symptom otherwise is that `GET`s work and writes
  return `403`.
- A reverse proxy for `/lpx/*` must preserve the `/lpx` path prefix (the refresh cookie is scoped
  to `Path=/lpx/auth/token`), forward `Authorization`, `X-Sec-Token` and `Cookie`, pass `Set-Cookie`
  back untouched, allow all methods, disable caching, and send the **upstream's** `Host` rather than
  the viewer's.

## Changing an app client

Edit the client in the console (앱 클라이언트 관리 → 수정) to change its name, allowed origins or
flags. The client id does not change, so no integrated app needs redeploying.

Never delete and recreate a client to change a setting: that issues a **new** client id and breaks
every app using it.

## Installing this skill

Place both files together so the reference resolves:

```
.claude/skills/lionkorea-auth-integration/
├── SKILL.md       (this file)
└── reference.md   (the 연동 안내서 download, renamed)
```

Both are downloadable from the admin console's 앱 클라이언트 관리 page.
