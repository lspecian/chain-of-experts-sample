import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { ExpertConfig } from '../experts';
import { ExpertMetadata } from '../chain/types';

// Define the storage file path
const STORAGE_DIR = path.join(process.cwd(), 'data');
const EXPERTS_FILE = path.join(STORAGE_DIR, 'experts.json');

// Interface for stored expert data
export interface StoredExpertConfig extends ExpertConfig {
  id: string; // Unique identifier
  createdAt: string;
  updatedAt: string;
  isBuiltIn: boolean; // Flag to identify built-in experts
}

// Ensure storage directory exists
function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    try {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
      logger.info(`Created storage directory: ${STORAGE_DIR}`);
    } catch (error) {
      logger.error('Failed to create storage directory', error instanceof Error ? error : undefined);
      throw new Error('Failed to create storage directory');
    }
  }
}

// Initialize storage file if it doesn't exist
function initStorageFile(): void {
  if (!fs.existsSync(EXPERTS_FILE)) {
    try {
      fs.writeFileSync(EXPERTS_FILE, JSON.stringify({ experts: [] }, null, 2));
      logger.info(`Created experts storage file: ${EXPERTS_FILE}`);
    } catch (error) {
      logger.error('Failed to create experts storage file', error instanceof Error ? error : undefined);
      throw new Error('Failed to create experts storage file');
    }
  }
}

// Read experts from storage
export function readExperts(): StoredExpertConfig[] {
  ensureStorageDir();
  initStorageFile();

  try {
    const data = fs.readFileSync(EXPERTS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.experts || [];
  } catch (error) {
    logger.error('Failed to read experts from storage', error instanceof Error ? error : undefined);
    return [];
  }
}

// Write experts to storage
export function writeExperts(experts: StoredExpertConfig[]): boolean {
  ensureStorageDir();

  try {
    fs.writeFileSync(EXPERTS_FILE, JSON.stringify({ experts }, null, 2));
    logger.info(`Wrote ${experts.length} experts to storage`);
    return true;
  } catch (error) {
    logger.error('Failed to write experts to storage', error instanceof Error ? error : undefined);
    return false;
  }
}

// Get expert by ID
export function getExpertById(id: string): StoredExpertConfig | undefined {
  const experts = readExperts();
  return experts.find(expert => expert.id === id);
}

// Get expert by name
export function getExpertByName(name: string): StoredExpertConfig | undefined {
  const experts = readExperts();
  return experts.find(expert => expert.name === name);
}

// Add a new expert
export function addExpert(expert: Omit<StoredExpertConfig, 'id' | 'createdAt' | 'updatedAt'>): StoredExpertConfig | null {
  const experts = readExperts();
  
  // Check if expert with same name already exists
  if (experts.some(e => e.name === expert.name)) {
    logger.warn(`Expert with name ${expert.name} already exists`);
    return null;
  }

  // Generate a unique ID
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  const newExpert: StoredExpertConfig = {
    ...expert,
    id,
    createdAt: now,
    updatedAt: now,
    isBuiltIn: false,
  };

  experts.push(newExpert);
  
  if (writeExperts(experts)) {
    logger.info(`Added new expert: ${expert.name} (${id})`);
    return newExpert;
  }
  
  return null;
}

// Update an existing expert
export function updateExpert(id: string, updates: Partial<Omit<StoredExpertConfig, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltIn'>>): StoredExpertConfig | null {
  const experts = readExperts();
  const index = experts.findIndex(e => e.id === id);
  
  if (index === -1) {
    logger.warn(`Expert with ID ${id} not found`);
    return null;
  }

  // Don't allow updating built-in experts
  if (experts[index].isBuiltIn) {
    logger.warn(`Cannot update built-in expert: ${experts[index].name}`);
    return null;
  }

  const updatedExpert: StoredExpertConfig = {
    ...experts[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  experts[index] = updatedExpert;
  
  if (writeExperts(experts)) {
    logger.info(`Updated expert: ${updatedExpert.name} (${id})`);
    return updatedExpert;
  }
  
  return null;
}

// Delete an expert
export function deleteExpert(id: string): boolean {
  const experts = readExperts();
  const expert = experts.find(e => e.id === id);
  
  if (!expert) {
    logger.warn(`Expert with ID ${id} not found`);
    return false;
  }

  // Don't allow deleting built-in experts
  if (expert.isBuiltIn) {
    logger.warn(`Cannot delete built-in expert: ${expert.name}`);
    return false;
  }

  const filteredExperts = experts.filter(e => e.id !== id);
  
  if (writeExperts(filteredExperts)) {
    logger.info(`Deleted expert: ${expert.name} (${id})`);
    return true;
  }
  
  return false;
}

// Initialize storage with built-in experts
export function initializeBuiltInExperts(builtInExperts: ExpertConfig[]): void {
  const experts = readExperts();
  
  // Only add built-in experts if they don't exist
  const existingBuiltInNames = experts
    .filter(e => e.isBuiltIn)
    .map(e => e.name);
  
  const newBuiltInExperts = builtInExperts
    .filter(e => !existingBuiltInNames.includes(e.name))
    .map(expert => {
      const id = 'builtin-' + expert.name;
      const now = new Date().toISOString();
      
      return {
        ...expert,
        id,
        createdAt: now,
        updatedAt: now,
        isBuiltIn: true,
      } as StoredExpertConfig;
    });
  
  if (newBuiltInExperts.length > 0) {
    const updatedExperts = [...experts, ...newBuiltInExperts];
    if (writeExperts(updatedExperts)) {
      logger.info(`Added ${newBuiltInExperts.length} built-in experts to storage`);
    }
  }
}