# Azure deployment configuration

The application keeps local development and Azure production configuration separate:

- Local development uses SQLite and the Vite `/api` proxy.
- Azure production uses SQL Server and secrets supplied by App Service settings.
- The production frontend is `https://my-sleepy-koala.vercel.app`.

## Azure App Service settings

Add these under **App Service > Settings > Environment variables**. Never commit the real values.

| Setting | Value |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `Database__Provider` | `SqlServer` |
| `ConnectionStrings__DefaultConnection` | Azure SQL connection string |
| `Jwt__Key` | A new random secret of at least 32 bytes |
| `Jwt__Issuer` | `SleepyKoalaApi` |
| `Jwt__Audience` | `SleepyKoalaClient` |
| `Cors__AllowedOrigins__0` | `https://my-sleepy-koala.vercel.app` |

Enable **HTTPS Only** and configure the App Service health check path as `/health`.

The JWT key that was previously committed must not be reused. Generate a new production key before deployment.

## Azure SQL migration

The existing migrations are provider-neutral for a new database. The design-time factory reads `Database__Provider` and `ConnectionStrings__DefaultConnection`. Run the following from a secure deployment environment after supplying those values:

```bash
dotnet ef database update --project backend/SleepyKoala.Api.csproj
```

Do not put the Azure SQL password in this repository or in a shell script. Prefer an Azure managed identity connection when available; otherwise store the connection string in App Service settings.

## Vercel setting

After the Azure backend URL is known, add this under **Vercel > Project Settings > Environment Variables**:

```text
VITE_API_BASE_URL=https://your-app-name.azurewebsites.net
```

Redeploy the frontend after changing this variable because Vite embeds it at build time. Local development can leave it unset and will continue using the proxy in `vite.config.ts`.

## Smoke checks

After deployment, verify:

1. `GET https://your-app-name.azurewebsites.net/health` returns success.
2. Registration and login work from the Vercel site.
3. Settings, check-in history, badges, and leaderboard load correctly.
4. Refreshing a frontend route does not return a 404.
5. App Service logs contain no CORS, database, or JWT configuration errors.
