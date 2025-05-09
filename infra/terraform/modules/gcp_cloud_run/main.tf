# Terraform Module: GCP Cloud Run Service
# Defines resources for deploying a containerized service on GCP Cloud Run,
# including API enablement, Artifact Registry, Secret Manager, and Cloud Run service.

# --- API Enablement ---
# Enable required APIs for the project
resource "google_project_service" "run_api" {
  project            = var.gcp_project_id
  service            = "run.googleapis.com"
  disable_on_destroy = false # Keep API enabled even if TF destroys resources
}

resource "google_project_service" "artifactregistry_api" {
  project            = var.gcp_project_id
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "secretmanager_api" {
  project            = var.gcp_project_id
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

# Add other APIs like cloudbuild.googleapis.com if needed for CI/CD

# --- Artifact Registry Repository ---
resource "google_artifact_registry_repository" "app_repo" {
  project       = var.gcp_project_id
  location      = var.gcp_region
  # Repository ID should be unique within the project/location
  repository_id = "${var.service_name}-repo" 
  description   = "Docker repository for ${var.service_name}"
  format        = "DOCKER" # Specify Docker format

  labels = merge(
    {
      "environment" = var.environment,
      "project"     = var.project_name,
      "service"     = var.service_name
    },
    var.tags
  )

  depends_on = [google_project_service.artifactregistry_api]
}

# --- Secret Manager Secret ---
# Create the secret resource (container for versions)
resource "google_secret_manager_secret" "langfuse_secret_key" {
  project   = var.gcp_project_id
  secret_id = "${var.project_name}-${var.service_name}-${var.environment}-langfuse-secret"

  replication = { # Adding back required replication block
    automatic = {}
  }

  labels = merge(
    {
      "environment" = var.environment,
      "project"     = var.project_name,
      "service"     = var.service_name
    },
    var.tags
  )

  depends_on = [google_project_service.secretmanager_api]
}

# Add the initial version of the secret
resource "google_secret_manager_secret_version" "langfuse_secret_key_version" {
  secret      = google_secret_manager_secret.langfuse_secret_key.id
  secret_data = var.langfuse_secret_key # Pass the actual secret value as a variable
}

# --- Cloud Run Service ---
resource "google_cloud_run_v2_service" "app_service" {
  project  = var.gcp_project_id
  location = var.gcp_region
  # Service name should be unique within the project/region
  name     = "${var.project_name}-${var.service_name}-${var.environment}-svc" 

  template {
    # Service account for the Cloud Run revision (optional, defaults to Compute Engine default SA)
    # service_account = var.gcp_service_account_email 

    containers {
      # Construct image URL using Artifact Registry details
      image = "${var.gcp_region}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.app_repo.repository_id}/${var.project_name}-${var.service_name}:${var.image_tag}"
      
      ports {
        container_port = var.container_port
      }
      
      # Environment variables
      env {
        name  = "NODE_ENV"
        value = var.environment
      }
      env {
        name  = "LANGFUSE_PUBLIC_KEY"
        value = var.langfuse_public_key
      }
      env {
        name  = "LANGFUSE_BASEURL"
        value = var.langfuse_baseurl
      }
      # Inject secret from Secret Manager
      env {
        name = "LANGFUSE_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.langfuse_secret_key.secret_id
            version = "latest" # Use the latest version of the secret
          }
        }
      }
      # Add other environment variables as needed
      
      # Resource limits (adjust as needed)
      resources {
        limits = {
          cpu    = var.cloud_run_cpu_limit    # e.g., "1000m" (1 vCPU)
          memory = var.cloud_run_memory_limit # e.g., "512Mi"
        }
        # startup_cpu_boost = true # Optional: Boost CPU during startup
      }
    }
    
    # Scaling configuration (adjust as needed)
    scaling {
      min_instance_count = var.cloud_run_min_instances
      max_instance_count = var.cloud_run_max_instances
    }

    # Optional: VPC Access Connector for private network access
    # vpc_access {
    #   connector = var.vpc_access_connector_id
    #   egress    = "ALL_TRAFFIC" 
    # }
  }

  # Traffic splitting (useful for blue/green, canary) - defaults to 100% to latest
  # traffic {
  #   type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  #   percent = 100
  # }

  labels = merge(
    {
      "environment" = var.environment,
      "project"     = var.project_name,
      "service"     = var.service_name
    },
    var.tags
  )
  
  depends_on = [
    google_project_service.run_api,
    google_artifact_registry_repository.app_repo,
    google_secret_manager_secret_version.langfuse_secret_key_version
  ]
}

# --- IAM Bindings ---

# Allow unauthenticated access to the Cloud Run service (adjust as needed)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = google_cloud_run_v2_service.app_service.project
  location = google_cloud_run_v2_service.app_service.location
  name     = google_cloud_run_v2_service.app_service.name
  role     = "roles/run.invoker"
  member   = "allUsers" # Use specific members/groups for restricted access
}

# Allow the Cloud Run service's identity (default SA or specified SA) to access the secret
resource "google_secret_manager_secret_iam_member" "secret_access" {
  project   = google_secret_manager_secret.langfuse_secret_key.project
  secret_id = google_secret_manager_secret.langfuse_secret_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  
  # Use the default identity if service_account is not specified for Cloud Run
  # Otherwise, use var.gcp_service_account_email prefixed with "serviceAccount:"
  member    = "serviceAccount:${var.gcp_service_account_email != "" ? var.gcp_service_account_email : data.google_compute_default_service_account.default.email}"

  depends_on = [google_cloud_run_v2_service.app_service]
}

# Data source to get the default compute service account if needed
data "google_compute_default_service_account" "default" {
  project = var.gcp_project_id
}