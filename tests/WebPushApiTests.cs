using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SleepyKoala.Api.Configuration;
using SleepyKoala.Api.DTOs;
using SleepyKoala.Api.Models;
using SleepyKoala.Api.Services;

namespace SleepyKoala.Tests;

public class WebPushApiTests
{
    [Fact]
    public async Task SubscriptionOwnershipValidationTestRateLimitAndDeletion()
    {
        var sender = new FakeSender();
        using var baseFactory = new SleepyKoalaApiFactory();
        using var factory = baseFactory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<WebPushSettings>();
            services.AddSingleton(new WebPushSettings { Enabled = true, PublicKey = "public", RunWorker = false,
                DispatchKey = new string('s', 64) });
            services.RemoveAll<IWebPushSender>();
            services.AddSingleton<IWebPushSender>(sender);
        }));
        var first = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await first.GetAsync("/api/push/config")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await first.PostAsync("/api/internal/reminders/dispatch", null)).StatusCode);
        await Register(first);
        var second = factory.CreateClient();
        await Register(second);
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var point = key.ExportParameters(false).Q;
        var subscription = new { endpoint = "https://web.push.apple.com/owned-test",
            p256dh = WebEncoders.Base64UrlEncode(new byte[] { 4 }.Concat(point.X!).Concat(point.Y!).ToArray()),
            auth = WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(16)),
            timeZoneId = "Pacific/Auckland", openingReminder = false, windDownReminder = false };
        var saved = await first.PutAsJsonAsync("/api/push/device", subscription);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var result = await saved.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(result.GetProperty("openingReminder").GetBoolean());
        Assert.True(result.GetProperty("windDownReminder").GetBoolean());
        var id = result.GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.Conflict, (await second.PutAsJsonAsync("/api/push/device", subscription)).StatusCode);
        var invisible = await second.PostAsJsonAsync("/api/push/device", new { subscription.endpoint });
        Assert.Equal(JsonValueKind.Null, (await invisible.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("device").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await second.PostAsJsonAsync($"/api/push/devices/{id}/test", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await first.PostAsJsonAsync($"/api/push/devices/{id}/test", new { })).StatusCode);
        Assert.StartsWith("test-", sender.LastTag);
        Assert.Equal(32, sender.LastTag!.Length);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await first.PostAsJsonAsync($"/api/push/devices/{id}/test", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await first.PutAsJsonAsync($"/api/push/devices/{id}/timezone", new { timeZoneId = "no/such-zone" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await first.PutAsJsonAsync($"/api/push/devices/{id}/timezone", new { timeZoneId = "Europe/London" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await second.PostAsJsonAsync("/api/push/unsubscribe", new { subscription.endpoint })).StatusCode);
        var owned = await first.PostAsJsonAsync("/api/push/device", new { subscription.endpoint });
        Assert.Equal(id, (await owned.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("device").GetProperty("id").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await first.DeleteAsync("/api/account/me")).StatusCode);
        var removed = await first.PostAsJsonAsync("/api/push/device", new { subscription.endpoint });
        Assert.Equal(JsonValueKind.Null, (await removed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("device").ValueKind);
        first.DefaultRequestHeaders.Add("X-Reminder-Key", new string('s', 64));
        Assert.Equal(HttpStatusCode.NoContent, (await first.PostAsync("/api/internal/reminders/dispatch", null)).StatusCode);
    }

    private static async Task Register(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest {
            RegistrationAttemptId = Guid.NewGuid(), Email = $"{Guid.NewGuid()}@example.test",
            Password = "Password123!", Nickname = "Koala" });
        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
    }

    private sealed class FakeSender : IWebPushSender
    {
        public string? LastTag { get; private set; }
        public Task<PushResult> SendAsync(PushDevice device, string body, string tag, CancellationToken ct)
        {
            LastTag = tag;
            return Task.FromResult(PushResult.Sent);
        }
    }
}
