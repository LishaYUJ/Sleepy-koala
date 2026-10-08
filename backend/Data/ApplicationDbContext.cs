using Microsoft.EntityFrameworkCore;
using SleepyKoala.Api.Models;

namespace SleepyKoala.Api.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<UserSettings> UserSettings { get; set; }
        public DbSet<CheckIn> CheckIns { get; set; }
        public DbSet<Badge> Badges { get; set; }
        public DbSet<UserBadge> UserBadges { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>(user =>
            {
                user.Property(u => u.Email).HasMaxLength(320);
                user.Property(u => u.PasswordHash).HasMaxLength(100);
                user.Property(u => u.Nickname).HasMaxLength(50);
            });

            modelBuilder.Entity<Badge>(badge =>
            {
                badge.Property(b => b.Name).HasMaxLength(100);
                badge.Property(b => b.Description).HasMaxLength(500);
            });

            modelBuilder.Entity<CheckIn>(checkIn =>
            {
                checkIn.Property(c => c.LocalCheckInDate).HasMaxLength(10);
                checkIn.Property(c => c.Status).HasMaxLength(16);
            });

            modelBuilder.Entity<UserSettings>(settings =>
            {
                settings.Property(s => s.CutoffTime).HasMaxLength(5);
                settings.Property(s => s.TimeZoneId).HasMaxLength(100);
                settings.Property(s => s.TrackingStartSleepDate).HasMaxLength(10);
            });

            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email)
                .IsUnique();

            modelBuilder.Entity<User>()
                .HasIndex(u => u.RegistrationAttemptId)
                .IsUnique();
                
            modelBuilder.Entity<CheckIn>()
                .HasIndex(c => new { c.UserId, c.LocalCheckInDate })
                .IsUnique(); // Ensure only one checkin per local date per user
                
            // Configure One-to-One between User and UserSettings
            modelBuilder.Entity<User>()
                .HasOne(u => u.Settings)
                .WithOne(s => s.User)
                .HasForeignKey<UserSettings>(s => s.UserId);

            // Seed initial badges
            modelBuilder.Entity<Badge>().HasData(
                new Badge { Id = Guid.Parse("11111111-1111-1111-1111-111111111111"), Name = "First Sleep", Description = "Completed your first on-time bedtime check-in", RequiredStreak = 1 },
                new Badge { Id = Guid.Parse("22222222-2222-2222-2222-222222222222"), Name = "3-Day Koala Care", Description = "Complete 3 consecutive on-time bedtime check-ins", RequiredStreak = 3 },
                new Badge { Id = Guid.Parse("33333333-3333-3333-3333-333333333333"), Name = "One Week Calm", Description = "Complete 7 consecutive on-time bedtime check-ins", RequiredStreak = 7 }
            );
        }
    }
}
