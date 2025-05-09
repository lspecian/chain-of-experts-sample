// Mock data representing experts
// This will be replaced with actual API calls once the backend is ready (Task 27.4)

export interface Expert {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  specialization: string;
  lastActivity: string; // ISO date string
  // Add other relevant fields as defined by the backend
}

const mockExperts: Expert[] = [
  { id: '1', name: 'Expert Alpha', status: 'active', specialization: 'Data Analysis', lastActivity: new Date().toISOString() },
  { id: '2', name: 'Expert Beta', status: 'inactive', specialization: 'Machine Learning', lastActivity: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: '3', name: 'Expert Gamma', status: 'active', specialization: 'NLP', lastActivity: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: '4', name: 'Expert Delta', status: 'pending', specialization: 'Image Processing', lastActivity: new Date(Date.now() - 86400000 * 5).toISOString() },
  { id: '5', name: 'Expert Epsilon', status: 'active', specialization: 'Data Visualization', lastActivity: new Date().toISOString() },
];

/**
 * Fetches a list of experts.
 * TODO: Replace with actual API call to GET /experts
 */
export const fetchExperts = async (): Promise<Expert[]> => {
  console.log('Fetching experts (mocked)...');
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  return Promise.resolve([...mockExperts]); // Return a copy
};

/**
 * Fetches a single expert by ID.
 * TODO: Replace with actual API call to GET /experts/{id}
 */
export const fetchExpertById = async (id: string): Promise<Expert | undefined> => {
  console.log(`Fetching expert by ID: ${id} (mocked)...`);
  await new Promise(resolve => setTimeout(resolve, 300));
  return Promise.resolve(mockExperts.find(expert => expert.id === id));
};

// Add other service functions as needed (create, update, delete)
// e.g., createExpert, updateExpert, deleteExpert