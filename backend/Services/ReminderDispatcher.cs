using Microsoft.EntityFrameworkCore;
using SleepyKoala.Api.Data;
using SleepyKoala.Api.Models;

namespace SleepyKoala.Api.Services;

public sealed class ReminderDispatcher(ApplicationDbContext db, IWebPushSender sender, TimeProvider clock)
{
    public async Task DispatchAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var retention = now.UtcDateTime.AddDays(-14);
        await db.PushDeliveries.Where(x => x.ClaimedAtUtc < retention).ExecuteDeleteAsync(ct);
        var devices = await db.PushDevices.AsNoTracking().Include(d => d.User).ThenInclude(u => u!.Settings)
            .Where(d => d.OpeningReminder || d.WindDownReminder).ToListAsync(ct);
        foreach (var device in devices)
        {
            if (device.User?.Settings is not { OnboardingCompleted: true } settings) continue;
            var due = ReminderSchedule.GetDue(device, settings.CutoffTime, clock.GetUtcNow());
            if (due == null) continue;
            // Recheck each device just before sending: check-ins on any device silence the evening.
            if (await db.CheckIns.AnyAsync(c => c.UserId == device.UserId && c.LocalCheckInDate == due.SleepDate, ct)) continue;
            if (!await db.PushDevices.AnyAsync(d => d.Id == device.Id && d.UserId == device.UserId &&
                d.OpeningReminder == device.OpeningReminder && d.WindDownReminder == device.WindDownReminder, ct)) continue;

            var delivery = await db.PushDeliveries.AsNoTracking().SingleOrDefaultAsync(d =>
                d.PushDeviceId == device.Id && d.SleepDate == due.SleepDate && d.Kind == due.Kind, ct);
            var claimedAt = clock.GetUtcNow().UtcDateTime;
            if (delivery == null)
            {
                delivery = new PushDelivery { PushDeviceId = device.Id, SleepDate = due.SleepDate,
                    Kind = due.Kind, ClaimedAtUtc = claimedAt, Attempts = 1 };
                db.PushDeliveries.Add(delivery);
                try { await db.SaveChangesAsync(ct); }
                catch (DbUpdateException)
                {
                    db.Entry(delivery).State = EntityState.Detached;
                    // A competing worker may already own this delivery. Propagate unrelated DB failures.
                    if (await db.PushDeliveries.AnyAsync(d => d.PushDeviceId == device.Id &&
                        d.SleepDate == due.SleepDate && d.Kind == due.Kind, ct)) continue;
                    throw;
                }
                db.Entry(delivery).State = EntityState.Detached;
            }
            else
            {
                var stale = claimedAt.AddSeconds(-90);
                var claimed = await db.PushDeliveries.Where(d => d.Id == delivery.Id && !d.Completed &&
                    d.Attempts < 3 && d.ClaimedAtUtc < stale).ExecuteUpdateAsync(setters => setters
                        .SetProperty(d => d.ClaimedAtUtc, claimedAt).SetProperty(d => d.Attempts, d => d.Attempts + 1), ct);
                if (claimed == 0) continue;
            }
            var result = await sender.SendAsync(device, due.Body, $"bedtime-{due.SleepDate}-{due.Kind}", ct);
            if (result == PushResult.Expired)
                await db.PushDevices.Where(d => d.Id == device.Id).ExecuteDeleteAsync(ct);
            else if (result != PushResult.Retry)
                await db.PushDeliveries.Where(d => d.Id == delivery.Id).ExecuteUpdateAsync(s => s.SetProperty(d => d.Completed, true), ct);
        }
    }
}

public sealed class ReminderWorker(IServiceScopeFactory scopes, ILogger<ReminderWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<ReminderDispatcher>().DispatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                logger.LogError("Reminder dispatch failed ({ErrorType}); will retry next tick.", ex.GetType().Name);
            }
        }
    }
}
