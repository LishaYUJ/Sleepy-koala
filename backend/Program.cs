using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.IdentityModel.Tokens;
using SleepyKoala.Api.Configuration;
using SleepyKoala.Api.Data;
using SleepyKoala.Api.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");
var databaseProvider = builder.Configuration["Database:Provider"] ?? "Sqlite";
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

// Add services to the container.

// 1. Database
builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    if (databaseProvider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
    {
        options
            .UseSqlServer(connectionString)
            // The migration snapshot is generated with SQLite for local development.
            // Individual migrations select provider-specific SQL at runtime.
            .ConfigureWarnings(warnings => warnings.Ignore(
                RelationalEventId.PendingModelChangesWarning));
        return;
    }

    if (databaseProvider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase))
    {
        options.UseSqlite(connectionString);
        return;
    }

    throw new InvalidOperationException(
        $"Unsupported database provider '{databaseProvider}'. Use 'Sqlite' or 'SqlServer'.");
});

// 2. Authentication (JWT)
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    var jwtSettings = JwtSettings.FromConfiguration(builder.Configuration);
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidAudience = jwtSettings.Audience,
        IssuerSigningKey = jwtSettings.CreateSecurityKey(),
        ClockSkew = TimeSpan.FromMinutes(1)
    };
});

// 3. Application Services
builder.Services.AddSingleton(_ => JwtSettings.FromConfiguration(builder.Configuration));
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ICheckInService, CheckInService>();
builder.Services.AddScoped<CheckInSummaryService>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<ISleepCalendarService, SleepCalendarService>();

// 4. Controllers & Features
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (allowedOrigins.Length == 0)
        {
            throw new InvalidOperationException(
                "No CORS origins are configured. Set Cors:AllowedOrigins.");
        }

        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

var app = builder.Build();

if (builder.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.Migrate();
}

// Scalar is an assessment requirement and remains available in deployed environments.
app.MapOpenApi();
app.MapScalarApiReference();

app.UseHttpsRedirection();

app.UseCors("Frontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");

app.Run();

public partial class Program { }
