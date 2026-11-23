using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;

namespace SleepyKoala.Api.Configuration;

public sealed class WebPushSettings
{
    public bool Enabled { get; set; }
    public bool RunWorker { get; set; } = true;
    public string DispatchKey { get; set; } = "";
    public string Subject { get; set; } = "";
    public string PublicKey { get; set; } = "";
    public string PrivateKey { get; set; } = "";

    public void Validate()
    {
        if (!Enabled) return;
        if ((!RunWorker || DispatchKey.Length > 0) && DispatchKey.Length < 32)
            throw new InvalidOperationException("External reminder scheduling requires a WebPush:DispatchKey of at least 32 characters.");
        if (!Uri.TryCreate(Subject, UriKind.Absolute, out var subject) ||
            (subject.Scheme != "mailto" && subject.Scheme != "https"))
            throw new InvalidOperationException("WebPush:Subject must be a mailto: or HTTPS contact URI.");
        try
        {
            var publicBytes = WebEncoders.Base64UrlDecode(PublicKey);
            var privateBytes = WebEncoders.Base64UrlDecode(PrivateKey);
            if (publicBytes.Length != 65 || publicBytes[0] != 4 || privateBytes.Length != 32)
                throw new FormatException();
            using var key = ECDsa.Create(new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256, D = privateBytes,
                Q = new ECPoint { X = publicBytes[1..33], Y = publicBytes[33..65] }
            });
            var signature = key.SignData("validate"u8, HashAlgorithmName.SHA256);
            using var publicKey = ECDsa.Create(new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = new ECPoint { X = publicBytes[1..33], Y = publicBytes[33..65] }
            });
            if (!publicKey.VerifyData("validate"u8, signature, HashAlgorithmName.SHA256)) throw new FormatException();
        }
        catch (Exception ex) when (ex is FormatException or CryptographicException or ArgumentException)
        {
            throw new InvalidOperationException("Configure a matching WebPush public/private VAPID key pair.");
        }
    }
}
