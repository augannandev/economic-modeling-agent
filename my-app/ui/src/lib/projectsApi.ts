import { fetchWithAuth } from './serverComm';

// Types
export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  therapeutic_area: string | null;
  disease_condition: string | null;
  population: string | null;
  nct_id: string | null;
  intervention: string | null;
  comparator: string | null;
  status: 'draft' | 'active' | 'completed' | 'archived';
  settings: {
    defaultTimeHorizon?: number;
    currency?: string;
    discountRate?: number;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface Arm {
  id: string;
  project_id: string;
  name: string;
  arm_type: 'treatment' | 'comparator' | 'control';
  label: string | null;
  color: string | null;
  drug_name: string | null;
  dosage: string | null;
  regimen: string | null;
  sample_size: number | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Endpoint {
  id: string;
  project_id: string;
  endpoint_type: 'OS' | 'PFS' | 'DFS' | 'EFS' | 'TTP' | 'ORR' | 'CR' | 'PR' | 'OTHER';
  custom_name: string | null;
  description: string | null;
  time_horizon: number;
  observed_followup: number | null;
  status: 'pending' | 'data_ready' | 'analyzed' | 'reviewed';
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DataSource {
  id: string;
  project_id: string;
  arm_id: string | null;
  endpoint_id: string | null;
  source_type: 'ipd_parquet' | 'ipd_csv' | 'digitized' | 'published_km' | 'external_api';
  name: string;
  file_path: string | null;
  original_filename: string | null;
  is_primary: boolean;
  processing_status: 'pending' | 'processing' | 'ready' | 'error';
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  therapeutic_area?: string;
  disease_condition?: string;
  population?: string;
  nct_id?: string;
  intervention?: string;
  comparator?: string;
}

export interface CreateArmInput {
  name: string;
  arm_type: 'treatment' | 'comparator' | 'control';
  label?: string;
  color?: string;
  drug_name?: string;
  dosage?: string;
  regimen?: string;
  sample_size?: number;
}

export interface CreateEndpointInput {
  endpoint_type: Endpoint['endpoint_type'];
  custom_name?: string;
  description?: string;
  time_horizon?: number;
}

// API Functions
export const projectsApi = {
  // Projects
  async listProjects(): Promise<{ projects: Project[] }> {
    const response = await fetchWithAuth('/api/v1/projects');
    return response.json();
  },

  async getProject(projectId: string): Promise<{ project: Project }> {
    const response = await fetchWithAuth(`/api/v1/projects/${projectId}`);
    return response.json();
  },

  async createProject(data: CreateProjectInput): Promise<{ project: Project }> {
    const response = await fetchWithAuth('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async updateProject(projectId: string, data: Partial<CreateProjectInput>): Promise<{ project: Project }> {
    const response = await fetchWithAuth(`/api/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async deleteProject(projectId: string): Promise<void> {
    await fetchWithAuth(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
    });
  },

  // Arms
  async listArms(projectId: string): Promise<{ arms: Arm[] }> {
    const response = await fetchWithAuth(`/api/v1/projects/${projectId}/arms`);
    return response.json();
  },

  async createArm(projectId: string, data: CreateArmInput): Promise<{ arm: Arm }> {
    const response = await fetchWithAuth(`/api/v1/projects/${projectId}/arms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async deleteArm(projectId: string, armId: string): Promise<void> {
    await fetchWithAuth(`/api/v1/projects/${projectId}/arms/${armId}`, {
      method: 'DELETE',
    });
  },

  // Endpoints
  async listEndpoints(projectId: string): Promise<{ endpoints: Endpoint[] }> {
    const response = await fetchWithAuth(`/api/v1/projects/${projectId}/endpoints`);
    return response.json();
  },

  async createEndpoint(projectId: string, data: CreateEndpointInput): Promise<{ endpoint: Endpoint }> {
    const response = await fetchWithAuth(`/api/v1/projects/${projectId}/endpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async deleteEndpoint(projectId: string, endpointId: string): Promise<void> {
    await fetchWithAuth(`/api/v1/projects/${projectId}/endpoints/${endpointId}`, {
      method: 'DELETE',
    });
  },

  // Data Sources
  async listDataSources(projectId: string): Promise<{ data_sources: DataSource[] }> {
    const response = await fetchWithAuth(`/api/v1/projects/${projectId}/data-sources`);
    return response.json();
  },

  async uploadDataSource(
    projectId: string,
    file: File,
    armId?: string,
    endpointId?: string
  ): Promise<{ data_source: DataSource }> {
    const formData = new FormData();
    formData.append('file', file);
    if (armId) formData.append('arm_id', armId);
    if (endpointId) formData.append('endpoint_id', endpointId);

    const response = await fetchWithAuth(`/api/v1/projects/${projectId}/data-sources/upload`, {
      method: 'POST',
      body: formData,
    });
    return response.json();
  },

  async deleteDataSource(projectId: string, dataSourceId: string): Promise<void> {
    await fetchWithAuth(`/api/v1/projects/${projectId}/data-sources/${dataSourceId}`, {
      method: 'DELETE',
    });
  },
};

