# Outputs from the GCP Cloud Run module

output "cloud_run_service_name" {
  description = "The name of the Cloud Run service"
  value       = google_cloud_run_v2_service.app_service.name
}

output "cloud_run_service_url" {
  description = "The URL of the Cloud Run service"
  value       = google_cloud_run_v2_service.app_service.uri
}

output "artifact_registry_repository_name" {
  description = "The name of the Artifact Registry repository"
  # The output format is projects/<project>/locations/<location>/repositories/<repo_id>
  value       = google_artifact_registry_repository.app_repo.name 
}

output "secret_manager_secret_id" {
  description = "The ID of the Secret Manager secret created"
  value       = google_secret_manager_secret.langfuse_secret_key.secret_id
}

output "secret_manager_secret_name" {
  description = "The resource name of the Secret Manager secret created"
  value       = google_secret_manager_secret.langfuse_secret_key.name
}