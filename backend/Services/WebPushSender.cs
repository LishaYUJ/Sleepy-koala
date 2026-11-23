using System.Net;
using System.Text.Json;
using SleepyKoala.Api.Configuration;
using SleepyKoala.Api.Models;
using Lib.Net.Http.WebPush;
using Lib.Net.Http.WebPush.Authentication;

namespace SleepyKoala.Api.Services;

public enum PushResult { Sent, Expired, Retry, Failed }

public interface IWebPushSender
{
    Task<PushResult> SendAsync(PushDevice device, string body, string tag, CancellationToken ct);
}

public sealed class WebPushSender(HttpClient http, WebPushSettings settings, ILogger<WebPushSender> logger) : IWebPushSender
{
    public async Task<PushResult> SendAsync(PushDevice device, string body, string tag, CancellationToken ct)
    {
        var client = new PushServiceClient(http) { AutoRetryAfter = false };
        var payload = JsonSerializer.Serialize(new { title = "Sleepy Koala", body, tag, url = "/dashboard" });
        try
        {
            await client.RequestPushMessageDeliveryAsync(new PushSubscription
                { Endpoint = device.Endpoint, Keys = new Dictionary<string, string> { ["p256dh"] = device.P256dh, ["auth"] = device.Auth } },
                new PushMessage(payload) { TimeToLive = 300, Topic = tag },
                new VapidAuthentication(settings.PublicKey, settings.PrivateKey) { Subject = settings.Subject }, ct);
            return PushResult.Sent;
        }
        catch (PushServiceClientException ex)
        {
            // Never log subscription endpoints, credentials or the response body.
            logger.LogWarning("Push delivery returned HTTP {Status}", (int)ex.StatusCode);
            if (ex.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone) return PushResult.Expired;
            return (int)ex.StatusCode == 429 || (int)ex.StatusCode >= 500 ? PushResult.Retry : PushResult.Failed;
        }
        catch (HttpRequestException) { return PushResult.Retry; }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { return PushResult.Retry; }
    }
}
