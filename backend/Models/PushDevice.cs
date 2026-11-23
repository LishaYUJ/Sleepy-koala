namespace SleepyKoala.Api.Models;

public class PushDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public required string Endpoint { get; set; }
    public required string EndpointHash { get; set; }
    public required string P256dh { get; set; }
    public required string Auth { get; set; }
    public required string TimeZoneId { get; set; }
    public bool OpeningReminder { get; set; }
    public bool WindDownReminder { get; set; }
    public DateTime? LastTestAtUtc { get; set; }
}

public class PushDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PushDeviceId { get; set; }
    public PushDevice? PushDevice { get; set; }
    public required string SleepDate { get; set; }
    public required string Kind { get; set; }
    public DateTime ClaimedAtUtc { get; set; }
    public bool Completed { get; set; }
    public int Attempts { get; set; }
}
