# Deploy your Clerk app to production

Before you begin:

1. You will need to have a domain you own.
2. You will need to be able to add DNS records on your domain.
3. You will need social sign-in (OAuth) credentials for any providers that you would like to use in production. Each [OAuth provider](https://clerk.com/docs/react/guides/configure/auth-strategies/social-connections/overview.md) has a dedicated guide on how to set up OAuth credentials for Clerk production apps.

## Create your production instance

1. Navigate to the [Clerk Dashboard](https://dashboard.clerk.com).
2. At the top of the Dashboard, select the **Development** button to reveal the instance selection dropdown. Select **Create production instance**.
3. You will be prompted with a modal to either clone your development instance settings to your production instance or create your production instance with Clerk's default settings.
4. The homepage of the dashboard will show you what is still required to deploy your production instance.

> For security reasons, [**SSO connections**](https://dashboard.clerk.com/~/user-authentication/sso-connections), [**Integrations**](https://dashboard.clerk.com/~/integrations), and [**Paths**](https://dashboard.clerk.com/~/paths) settings do not copy over. You will need to set these values again.

## API keys and environment variables

A common mistake when deploying to production is **forgetting to change your API keys to your production instances keys.** The best way to set this up is to make use of _environment variables_. All modern hosting providers, such as Vercel, AWS, GCP, Heroku, and Render, make it easy to add these values. Locally, you should use an `.env` file. This way, these values are being set dynamically depending on your environment. Here's a list of Clerk variables you'll need to change:

1. Publishable Key: Formatted as `pk_test_` in development and `pk_live_` in production. This is passed to the `<ClerkProvider>` during initialization.

2. Secret Key: Formatted as `sk_test_` in development and `sk_live_` in production. These values are used to access Clerk's Backend API.

> Be sure to update these values in your hosting provider's environment variables, and also to redeploy your app.

## Session token customization (required by this app)

This app reads the caller's email **off the session JWT** to detect a
duplicate-email account before onboarding (see `backend/app/api/v1/endpoints/me.py`
and `ClerkClaims.email` in `backend/app/core/auth.py`). Clerk's default session
token does **not** include email, so you must add it as a custom claim:

1. In the Clerk Dashboard, go to **Sessions → Customize session token → Claims**.
2. Add (alongside any existing custom claims):

   ```json
   { "email": "{{user.primary_email_address}}" }
   ```

3. Save. The claim now appears in the decoded JWT payload on every request.

Do this for **both** the development and production instances (custom claims are
per-instance and don't copy over). If the claim is missing the app **fails open**:
the pre-onboarding duplicate-email check is skipped and the collision instead
surfaces as a late 409 at onboarding submit — so the claim is what makes the
early, friendly block work.

> Custom claims share a ~1.2 KB budget (4 KB cookie cap minus Clerk's default
> claims). An email is tiny, but keep this in mind if you add more claims later.

## OAuth credentials

In development, for most social providers, Clerk provides you with a set of shared OAuth credentials.

In production, these are not secure and you will need to provide your own. Each [OAuth provider](https://clerk.com/docs/react/guides/configure/auth-strategies/social-connections/overview.md) has a dedicated guide on how to set up OAuth credentials for Clerk production apps.

## Webhooks

Your webhook endpoints will need to be updated to use your production instance's URL and signing secret. See the [guide on syncing data](https://clerk.com/docs/guides/development/webhooks/syncing.md?sdk=react#configure-your-production-instance) for more information.

## Content Security Policy (CSP)

If you're using a CSP, follow the instructions in the [CSP guide](https://clerk.com/docs/guides/secure/best-practices/csp-headers.md?sdk=react).

## DNS records

Clerk uses DNS records to provide session management and emails verified from your domain.

To see what DNS records you need, navigate to the [**Domains**](https://dashboard.clerk.com/~/domains) page in the Clerk Dashboard.

> It can take up to 48hrs for DNS records to fully propagate.

> If you're unable to add a CNAME record for the Frontend API, you can use a proxy instead. See [Proxying the Clerk Frontend API](https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi.md?sdk=react) for more information.

## Authentication across subdomains

When you set a root domain for your production deployment, Clerk's authentication will work across all subdomains. User sessions will also be shared across the subdomains.

> By default, the [Frontend API](https://clerk.com/docs/reference/frontend-api){{ target: '_blank' }} (FAPI) accepts cross-origin requests from **any** subdomain of your configured root domain, which increases your application's attack surface. For security purposes, it is strongly recommended to restrict which subdomains are allowed to make these requests by configuring a [subdomain allowlist](https://clerk.com/docs/guides/dashboard/dns-domains/subdomain-allowlist.md?sdk=react).

**Examples**

- `example-site.com` and `dashboard.example-site.com`
- `dashboard.example-site.com` and `accounts.example-site.com`

> If you're using [passkeys](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options.md?sdk=react#passkeys), only the first scenario in the above example will work due to restrictions in the [WebAuthn standard](https://www.w3.org/TR/webauthn-2/#sctn-rp-operations).

To share sessions and authentication across two different domains with the same Clerk application, see the [Authentication across different domains guide](https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains.md?sdk=react).

## Configure `authorizedParties` for secure request authorization

For enhanced security, it's highly recommended to explicitly set the `authorizedParties` option when authorizing requests. This option acts as an allowlist of origins to verify against, protecting your application from subdomain cookie leaking attacks. Without this setting, if an app on another subdomain of the same root domain as your Clerk app is compromised, that app could potentially generate valid sessions for your Clerk app.

The `authorizedParties` value should include a list of domains allowed to make requests to your application. Omitting this setting can expose your application to [CSRF attacks](https://owasp.org/www-community/attacks/csrf).

### Examples

The following examples show how to set `authorizedParties` with different Clerk helpers.

#### Set `authorizedParties` with `clerkMiddleware()`

```typescript
clerkMiddleware({
  authorizedParties: ["https://example.com"],
});
```

#### Set `authorizedParties` with `authenticateRequest()`

```typescript
clerkClient.authenticateRequest(req, {
  authorizedParties: ["https://example.com"],
});
```

## Deploy certificates

The Clerk Dashboard home page will tell you what steps are still required to deploy your production instance. Once you have completed all of the necessary steps, a **Deploy certificates** button will appear. Selecting this button will deploy your production instance.

## Troubleshooting

### DNS records not propagating with Cloudflare

Clerk uses a DNS check to validate this CNAME record. If this subdomain is reverse proxied behind a service that points to generic hostnames, such as Cloudflare, the DNS check will fail. Set the DNS record for this subdomain to a "DNS only" mode on your host to prevent proxying.

### Deployment stuck in certificate issuance

If your instance is stuck during TLS certificate issuance for longer than a few minutes, this might be caused due to certain [CAA DNS records](https://en.wikipedia.org/wiki/DNS_Certification_Authority_Authorization) set on your primary domain.

CAA are DNS records you may set to denote which certificate authorities (CA) are permitted to issue certificates for your domain, as a security measure against certain attacks. When you deploy your application, Clerk attempts to provision certificates using either the [LetsEncrypt](https://letsencrypt.org/) or [Google Trust Services](https://pki.goog/) certificate authorities.

Ensure that your primary domain (e.g., example.com) does not have any CAA records that prevent either LetsEncrypt or Google Trust Services from issuing certificates for your domain. To check this, run the following command in your terminal, replacing `example.com` with your app’s domain:

```sh
dig example.com +short CAA
```

If the command returns an empty response, your domain is correctly configured. If it returns any text, you need to remove the CAA records from your primary domain to avoid potential downtime during certificate renewal.

### Incorrect domain

If you accidentally set the wrong domain, you can change it through the Clerk Dashboard or the Backend API. For more information, see the [dedicated guide](https://clerk.com/docs/guides/development/deployment/changing-domains.md?sdk=react).

---

## Sitemap

[Overview of all docs pages](https://clerk.com/docs/llms.txt)
