using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SleepyKoala.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRegistrationIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var isSqlServer = ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer";
            var guidType = isSqlServer ? "uniqueidentifier" : "TEXT";

            migrationBuilder.AddColumn<Guid>(
                name: "RegistrationAttemptId",
                table: "Users",
                type: guidType,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_RegistrationAttemptId",
                table: "Users",
                column: "RegistrationAttemptId",
                unique: true,
                filter: isSqlServer ? "[RegistrationAttemptId] IS NOT NULL" : null);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_RegistrationAttemptId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "RegistrationAttemptId",
                table: "Users");
        }
    }
}
