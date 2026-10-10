using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SleepyKoala.Api.Data;
using SleepyKoala.Api.DTOs;

namespace SleepyKoala.Tests
{
    public sealed class SleepyKoalaApiFactory : WebApplicationFactory<Program>
    {
        public const string TestIssuer = "SleepyKoalaApi.Tests";
        public const string TestAudience = "SleepyKoalaClient.Tests";
        public const string TestJwtKey = "test_secret_key_that_is_long_enough_for_hmac_sha256_koala";
        public static readonly DateTimeOffset TestNow = new(2026, 7, 17, 10, 0, 0, TimeSpan.Zero);

        private SqliteConnection? _connection;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Key"] = TestJwtKey,
                    ["Jwt:Issuer"] = TestIssuer,
                    ["Jwt:Audience"] = TestAudience,
                    ["ConnectionStrings:DefaultConnection"] = "DataSource=:memory:"
                });
            });

            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
                services.RemoveAll<TimeProvider>();
                services.AddSingleton<TimeProvider>(new FixedTimeProvider(TestNow));

                _connection = new SqliteConnection("DataSource=:memory:");
                _connection.Open();

                services.AddDbContext<ApplicationDbContext>(options =>
                    options.UseSqlite(_connection));

                using var serviceProvider = services.BuildServiceProvider();
                using var scope = serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                db.Database.EnsureCreated();
            });
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            _connection?.Dispose();
        }

        private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
        {
            public override DateTimeOffset GetUtcNow() => now;
        }
    }

    public class ApiIntegrationTests : IClassFixture<SleepyKoalaApiFactory>
    {
        private readonly SleepyKoalaApiFactory _factory;

        public ApiIntegrationTests(SleepyKoalaApiFactory factory)
        {
            _factory = factory;
        }

        [Fact]
        public async Task HealthEndpoint_IsAvailableWithoutAuthentication()
        {
            var client = _factory.CreateClient();

            var response = await client.GetAsync("/health");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        [Fact]
        public async Task ScalarDocumentation_IsAvailableOutsideDevelopment()
        {
            var client = _factory.CreateClient();

            var scalarResponse = await client.GetAsync("/scalar/v1");
            var openApiResponse = await client.GetAsync("/openapi/v1.json");

            Assert.Equal(HttpStatusCode.OK, scalarResponse.StatusCode);
            Assert.Equal(HttpStatusCode.OK, openApiResponse.StatusCode);
        }

        [Fact]
        public async Task CorsPreflight_AllowsProductionFrontend()
        {
            const string origin = "https://msa-sleepy-koala.vercel.app";
            var client = _factory.CreateClient();
            var request = new HttpRequestMessage(HttpMethod.Options, "/api/auth/login");
            request.Headers.Add("Origin", origin);
            request.Headers.Add("Access-Control-Request-Method", "POST");

            var response = await client.SendAsync(request);

            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
            Assert.Equal(origin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        }

        [Fact]
        public async Task Register_WithSameAttemptId_IsIdempotent()
        {
            var client = _factory.CreateClient();
            var unique = Guid.NewGuid().ToString("N");
            var request = new RegisterRequest
            {
                RegistrationAttemptId = Guid.NewGuid(),
                Email = $"idempotent-{unique}@example.com",
                Password = "Password123!",
                Nickname = "Idempotent Koala"
            };

            var firstResponse = await client.PostAsJsonAsync("/api/auth/register", request);
            var retryResponse = await client.PostAsJsonAsync("/api/auth/register", request);

            Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
            Assert.Equal(HttpStatusCode.OK, retryResponse.StatusCode);

            var firstAuth = await firstResponse.Content.ReadFromJsonAsync<AuthResponse>();
            var retryAuth = await retryResponse.Content.ReadFromJsonAsync<AuthResponse>();
            Assert.NotNull(firstAuth);
            Assert.NotNull(retryAuth);
            Assert.Equal(firstAuth!.UserId, retryAuth!.UserId);

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            Assert.Equal(1, await db.Users.CountAsync(u => u.Email == request.Email));
        }

        [Fact]
        public async Task Register_ReusedAttemptIdWithDifferentDetails_IsRejected()
        {
            var client = _factory.CreateClient();
            var attemptId = Guid.NewGuid();
            var unique = Guid.NewGuid().ToString("N");
            var firstRequest = new RegisterRequest
            {
                RegistrationAttemptId = attemptId,
                Email = $"attempt-{unique}@example.com",
                Password = "Password123!",
                Nickname = "First Koala"
            };
            var conflictingRequest = new RegisterRequest
            {
                RegistrationAttemptId = attemptId,
                Email = firstRequest.Email,
                Password = firstRequest.Password,
                Nickname = "Different Koala"
            };

            var firstResponse = await client.PostAsJsonAsync("/api/auth/register", firstRequest);
            var conflictResponse = await client.PostAsJsonAsync("/api/auth/register", conflictingRequest);

            Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, conflictResponse.StatusCode);
            var error = await conflictResponse.Content.ReadFromJsonAsync<Dictionary<string, string>>();
            Assert.Equal("IdempotencyConflict", error!["error"]);
        }

        [Fact]
        public async Task AuthToken_FromLogin_IsAcceptedBySettingsMe()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);

            var loginResponse = await client.PostAsJsonAsync("/api/Auth/login", new LoginRequest
            {
                Email = credentials.Email,
                Password = credentials.Password
            });

            Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
            var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
            Assert.NotNull(auth);
            Assert.False(string.IsNullOrWhiteSpace(auth!.Token));

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.Token);
            var settingsResponse = await client.GetAsync("/api/settings/me");

            Assert.Equal(HttpStatusCode.OK, settingsResponse.StatusCode);
            var settings = await settingsResponse.Content.ReadFromJsonAsync<SettingsDto>();
            Assert.NotNull(settings);
            Assert.Equal(credentials.Nickname, settings!.Nickname);
            Assert.Equal("22:00", settings.CutoffTime);
            Assert.Equal("UTC", settings.TimeZoneId);
        }

        [Fact]
        public async Task AuthToken_HasExpectedIssuerAudienceSubjectAndExpiration()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);

            var loginResponse = await client.PostAsJsonAsync("/api/Auth/login", new LoginRequest
            {
                Email = credentials.Email,
                Password = credentials.Password
            });
            loginResponse.EnsureSuccessStatusCode();

            var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
            Assert.NotNull(auth);

            var token = new JwtSecurityTokenHandler().ReadJwtToken(auth!.Token);
            var jwtSettings = _factory.Services.GetRequiredService<SleepyKoala.Api.Configuration.JwtSettings>();
            Assert.Equal(jwtSettings.Issuer, token.Issuer);
            Assert.Contains(jwtSettings.Audience, token.Audiences);
            Assert.Equal(auth.UserId.ToString(), token.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Sub).Value);
            Assert.True(token.ValidTo > DateTime.UtcNow.AddDays(6));
            Assert.True(token.ValidTo <= DateTime.UtcNow.AddDays(7).AddMinutes(1));
        }

        [Fact]
        public async Task AuthenticatedUser_CanSaveAndReloadAvatar()
        {
            const string avatar = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);

            var updateResponse = await client.PutAsJsonAsync("/api/settings/me", new SettingsDto
            {
                Nickname = credentials.Nickname,
                CutoffTime = "22:00",
                AvatarDataUrl = avatar
            });

            Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
            var updatedSettings = await updateResponse.Content.ReadFromJsonAsync<SettingsDto>();
            Assert.Equal(avatar, updatedSettings!.AvatarDataUrl);

            var getResponse = await client.GetAsync("/api/settings/me");
            var reloadedSettings = await getResponse.Content.ReadFromJsonAsync<SettingsDto>();
            Assert.Equal(avatar, reloadedSettings!.AvatarDataUrl);

            client.DefaultRequestHeaders.Authorization = null;
            var loginResponse = await client.PostAsJsonAsync("/api/Auth/login", new LoginRequest
            {
                Email = credentials.Email,
                Password = credentials.Password
            });
            var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
            Assert.Equal(avatar, auth!.AvatarDataUrl);
        }

        [Fact]
        public async Task Settings_RejectsAvatarWithMismatchedImageContents()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);

            var response = await client.PutAsJsonAsync("/api/settings/me", new SettingsDto
            {
                Nickname = credentials.Nickname,
                CutoffTime = "22:00",
                AvatarDataUrl = "data:image/png;base64,bm90IGFuIGltYWdl"
            });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        [Fact]
        public async Task ProtectedApis_RejectMissingToken()
        {
            var client = _factory.CreateClient();

            var getSettings = await client.GetAsync("/api/settings/me");
            var putSettings = await client.PutAsJsonAsync("/api/settings/me", new SettingsDto
            {
                Nickname = "NoToken",
                CutoffTime = "22:00"
            });
            var getSummary = await client.GetAsync("/api/me/summary");
            var getBadges = await client.GetAsync("/api/badges/me");
            var postCheckIn = await client.PostAsJsonAsync("/api/CheckIns", new CheckInRequest
            {
                LocalDate = "2026-07-16",
                LocalTime = "21:30"
            });
            var getCheckIns = await client.GetAsync("/api/CheckIns/me");
            var deleteAccount = await client.DeleteAsync("/api/account/me");

            Assert.Equal(HttpStatusCode.Unauthorized, getSettings.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, putSettings.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, getSummary.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, getBadges.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, postCheckIn.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, getCheckIns.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, deleteAccount.StatusCode);
        }

        [Fact]
        public async Task AuthenticatedUser_CanDeleteOwnAccountAndRelatedData()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);

            var deleteResponse = await client.DeleteAsync("/api/account/me");

            Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

            var settingsAfterDelete = await client.GetAsync("/api/settings/me");
            Assert.Equal(HttpStatusCode.NotFound, settingsAfterDelete.StatusCode);

            client.DefaultRequestHeaders.Authorization = null;
            var loginAfterDelete = await client.PostAsJsonAsync("/api/Auth/login", new LoginRequest
            {
                Email = credentials.Email,
                Password = credentials.Password
            });
            Assert.Equal(HttpStatusCode.Unauthorized, loginAfterDelete.StatusCode);
        }

        [Fact]
        public async Task AuthenticatedUser_CanUseCurrentApiSurface()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);

            var updateSettings = await client.PutAsJsonAsync("/api/settings/me", new SettingsDto
            {
                Nickname = "Sleepy Tester",
                CutoffTime = "21:45"
            });
            Assert.Equal(HttpStatusCode.OK, updateSettings.StatusCode);

            var invalidSettings = await client.PutAsJsonAsync("/api/settings/me", new SettingsDto
            {
                Nickname = "Sleepy Tester",
                CutoffTime = "02:00"
            });
            Assert.Equal(HttpStatusCode.BadRequest, invalidSettings.StatusCode);

            var midnightSettings = await client.PutAsJsonAsync("/api/settings/me", new SettingsDto
            {
                Nickname = "Sleepy Tester",
                CutoffTime = "00:00"
            });
            Assert.Equal(HttpStatusCode.OK, midnightSettings.StatusCode);

            updateSettings = await client.PutAsJsonAsync("/api/settings/me", new SettingsDto
            {
                Nickname = "Sleepy Tester",
                CutoffTime = "21:45"
            });
            Assert.Equal(HttpStatusCode.OK, updateSettings.StatusCode);

            var settingsResponse = await client.GetAsync("/api/settings/me");
            Assert.Equal(HttpStatusCode.OK, settingsResponse.StatusCode);
            var settings = await settingsResponse.Content.ReadFromJsonAsync<SettingsDto>();
            Assert.Equal("Sleepy Tester", settings!.Nickname);
            Assert.Equal("21:45", settings.CutoffTime);

            var summaryBefore = await client.GetAsync("/api/me/summary?localDate=2026-07-16");
            Assert.Equal(HttpStatusCode.OK, summaryBefore.StatusCode);
            var before = await summaryBefore.Content.ReadFromJsonAsync<DashboardSummaryDto>();
            Assert.NotNull(before);
            Assert.False(before!.TodayCheckedIn);

            var badgesBefore = await client.GetAsync("/api/badges/me");
            Assert.Equal(HttpStatusCode.OK, badgesBefore.StatusCode);
            var badgeSummary = await badgesBefore.Content.ReadFromJsonAsync<BadgesSummaryDto>();
            Assert.NotNull(badgeSummary);
            Assert.True(badgeSummary!.Locked.Count >= 3);

            var checkInResponse = await client.PostAsJsonAsync("/api/CheckIns", new CheckInRequest
            {
                LocalDate = "2026-07-16",
                LocalTime = "21:30"
            });
            Assert.Equal(HttpStatusCode.OK, checkInResponse.StatusCode);
            var checkIn = await checkInResponse.Content.ReadFromJsonAsync<CheckInResponse>();
            Assert.NotNull(checkIn);
            Assert.Equal("onTime", checkIn!.Status);

            var duplicateCheckIn = await client.PostAsJsonAsync("/api/CheckIns", new CheckInRequest
            {
                LocalDate = "2026-07-16",
                LocalTime = "21:30"
            });
            Assert.Equal(HttpStatusCode.BadRequest, duplicateCheckIn.StatusCode);

            var historyResponse = await client.GetAsync("/api/CheckIns/me");
            Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);
            var history = await historyResponse.Content.ReadFromJsonAsync<List<CheckInHistoryDto>>();
            Assert.Single(history!);
            Assert.Equal(checkIn.CheckInId, history![0].Id);

            var summaryAfter = await client.GetAsync("/api/me/summary?localDate=2026-07-16");
            Assert.Equal(HttpStatusCode.OK, summaryAfter.StatusCode);
            var after = await summaryAfter.Content.ReadFromJsonAsync<DashboardSummaryDto>();
            Assert.True(after!.TodayCheckedIn);
            Assert.Equal("onTime", after.TodayStatus);

            var leaderboard = await client.GetAsync("/api/Leaderboard");
            Assert.Equal(HttpStatusCode.OK, leaderboard.StatusCode);
            var leaders = await leaderboard.Content.ReadFromJsonAsync<List<LeaderboardDto>>();
            Assert.Contains(leaders!, item => item.Nickname == "Sleepy Tester");

        }

        [Fact]
        public async Task DashboardSummary_InferMissingAfterCheckInWindowAndReportsFatigue()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);

            var sleepDate = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var summaryResponse = await client.GetAsync($"/api/me/summary?localDate={sleepDate}&localTime=10:00");

            Assert.Equal(HttpStatusCode.OK, summaryResponse.StatusCode);
            var summary = await summaryResponse.Content.ReadFromJsonAsync<DashboardSummaryDto>();
            Assert.NotNull(summary);
            Assert.False(summary!.TodayCheckedIn);
            Assert.Equal("missing", summary.TodayStatus);
            Assert.Equal(0, summary.CurrentStreak);
            Assert.Equal(2, summary.FatigueScore);
            Assert.Equal("healthy", summary.FatigueState);
        }

        [Fact]
        public async Task History_InferMissingOnlyAfterTheSleepWindowCloses()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);

            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = await db.Users.Include(u => u.Settings)
                    .SingleAsync(u => u.Email == credentials.Email);
                user.CreatedAtUtc = new DateTime(2026, 7, 16, 10, 0, 0, DateTimeKind.Utc);
                user.Settings!.TrackingStartSleepDate = "2026-07-16";
                await db.SaveChangesAsync();
            }

            var historyResponse = await client.GetAsync("/api/CheckIns/me");

            Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);
            var history = await historyResponse.Content.ReadFromJsonAsync<List<CheckInHistoryDto>>();
            var missing = Assert.Single(history!);
            Assert.Equal("2026-07-16", missing.LocalCheckInDate);
            Assert.Equal("missing", missing.Status);
            Assert.False(missing.Recorded);
            Assert.Null(missing.Id);
        }

        [Fact]
        public async Task History_PausesMissingInferenceAfterSevenConsecutiveNights()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);

            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = await db.Users.Include(u => u.Settings)
                    .SingleAsync(u => u.Email == credentials.Email);
                user.CreatedAtUtc = new DateTime(2026, 6, 1, 10, 0, 0, DateTimeKind.Utc);
                user.Settings!.TrackingStartSleepDate = null;
                await db.SaveChangesAsync();
            }

            var historyResponse = await client.GetAsync("/api/CheckIns/me");
            var history = await historyResponse.Content.ReadFromJsonAsync<List<CheckInHistoryDto>>();

            Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);
            Assert.NotNull(history);
            Assert.Equal(7, history!.Count(item => item.Status == "missing"));
            Assert.Contains(history!, item => item.LocalCheckInDate == "2026-06-01");
            Assert.Contains(history!, item => item.LocalCheckInDate == "2026-06-07");
            Assert.DoesNotContain(history!, item => item.LocalCheckInDate == "2026-06-08");
        }

        [Fact]
        public async Task History_ResumesMissingInferenceAfterARealCheckIn()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);

            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = await db.Users.Include(u => u.Settings)
                    .SingleAsync(u => u.Email == credentials.Email);
                user.CreatedAtUtc = new DateTime(2026, 6, 1, 10, 0, 0, DateTimeKind.Utc);
                user.Settings!.TrackingStartSleepDate = null;
                db.CheckIns.Add(new SleepyKoala.Api.Models.CheckIn
                {
                    UserId = user.Id,
                    LocalCheckInDate = "2026-07-10",
                    Status = "onTime",
                    CreatedAtUtc = new DateTime(2026, 7, 10, 10, 0, 0, DateTimeKind.Utc)
                });
                await db.SaveChangesAsync();
            }

            var historyResponse = await client.GetAsync("/api/CheckIns/me");
            var history = await historyResponse.Content.ReadFromJsonAsync<List<CheckInHistoryDto>>();

            Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);
            Assert.NotNull(history);
            Assert.Contains(history!, item => item.Recorded && item.LocalCheckInDate == "2026-07-10");
            Assert.Equal(13, history!.Count(item => item.Status == "missing"));
            Assert.Contains(history!, item => item.LocalCheckInDate == "2026-07-16" && item.Status == "missing");
        }

        [Fact]
        public async Task History_IncludesARealCheckInBeforeTheStoredTrackingStart()
        {
            var client = _factory.CreateClient();
            var credentials = await RegisterUserAsync(client);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);
            var checkedInAtUtc = new DateTime(2026, 7, 17, 0, 45, 0, DateTimeKind.Utc);

            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = await db.Users.Include(u => u.Settings)
                    .SingleAsync(u => u.Email == credentials.Email);
                user.Settings!.TrackingStartSleepDate = "2026-07-18";
                db.CheckIns.Add(new SleepyKoala.Api.Models.CheckIn
                {
                    UserId = user.Id,
                    LocalCheckInDate = "2026-07-17",
                    Status = "late",
                    CreatedAtUtc = checkedInAtUtc
                });
                await db.SaveChangesAsync();
            }

            var historyResponse = await client.GetAsync("/api/CheckIns/me");
            var history = await historyResponse.Content.ReadFromJsonAsync<List<CheckInHistoryDto>>();

            Assert.Equal(HttpStatusCode.OK, historyResponse.StatusCode);
            var recorded = Assert.Single(history!, item => item.Recorded);
            Assert.Equal("2026-07-17", recorded.LocalCheckInDate);
            Assert.Equal("late", recorded.Status);
            Assert.Equal(checkedInAtUtc, recorded.CheckedInAtUtc);
        }

        private static async Task<TestCredentials> RegisterUserAsync(HttpClient client)
        {
            var unique = Guid.NewGuid().ToString("N");
            var request = new RegisterRequest
            {
                RegistrationAttemptId = Guid.NewGuid(),
                Email = $"user-{unique}@example.com",
                Password = "Password123!",
                Nickname = $"Tester-{unique[..8]}"
            };

            var response = await client.PostAsJsonAsync("/api/Auth/register", request);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
            Assert.NotNull(auth);
            Assert.False(string.IsNullOrWhiteSpace(auth!.Token));

            return new TestCredentials(request.Email, request.Password, request.Nickname, auth.Token);
        }

        private sealed record TestCredentials(string Email, string Password, string Nickname, string Token);
    }
}
