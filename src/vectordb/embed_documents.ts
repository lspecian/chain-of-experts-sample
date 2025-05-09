import fs from 'fs';
import path from 'path';
import { getEmbeddingFunction, addDocuments } from './chromaClient';
import { logger } from '../utils/logger';

interface DocumentSource {
  type: 'file' | 'directory' | 'url' | 'text';
  path?: string;
  content?: string;
  url?: string;
  fileExtensions?: string[];
}

interface DocumentMetadata {
  title: string;
  source: string;
  category?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

interface ProcessedDocument {
  id: string;
  content: string;
  metadata: DocumentMetadata;
}

/**
 * Process a text file and extract its content
 * @param filePath Path to the text file
 * @returns The file content as a string
 */
function processTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    logger.error(`Failed to read file: ${filePath}`, error instanceof Error ? error : undefined);
    throw new Error(`Failed to read file: ${filePath}`);
  }
}

/**
 * Extract metadata from a file
 * @param filePath Path to the file
 * @returns Metadata object
 */
function extractMetadataFromFile(filePath: string): DocumentMetadata {
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const fileExt = path.extname(filePath).toLowerCase();
  const fileNameWithoutExt = path.basename(filePath, fileExt);
  
  // Determine category based on file extension
  let category = 'Document';
  if (['.md', '.txt'].includes(fileExt)) category = 'Text';
  else if (['.js', '.ts', '.py', '.java', '.c', '.cpp'].includes(fileExt)) category = 'Code';
  else if (['.json', '.yaml', '.yml', '.xml'].includes(fileExt)) category = 'Configuration';
  else if (['.pdf'].includes(fileExt)) category = 'PDF';
  
  return {
    title: fileNameWithoutExt,
    source: filePath,
    category,
    createdAt: stats.birthtime.toISOString(),
    updatedAt: stats.mtime.toISOString(),
    fileSize: stats.size
  };
}

/**
 * Process a directory and extract all text files
 * @param dirPath Path to the directory
 * @param fileExtensions Array of file extensions to include (e.g., ['.txt', '.md'])
 * @returns Array of processed documents
 */
function processDirectory(dirPath: string, fileExtensions: string[] = ['.txt', '.md']): ProcessedDocument[] {
  try {
    const processedDocs: ProcessedDocument[] = [];
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        // Recursively process subdirectories
        const subDirDocs = processDirectory(filePath, fileExtensions);
        processedDocs.push(...subDirDocs);
      } else if (stats.isFile()) {
        const fileExt = path.extname(file).toLowerCase();
        if (fileExtensions.includes(fileExt)) {
          const content = processTextFile(filePath);
          const metadata = extractMetadataFromFile(filePath);
          
          processedDocs.push({
            id: `file_${Date.now()}_${processedDocs.length}`,
            content,
            metadata
          });
        }
      }
    }
    
    return processedDocs;
  } catch (error) {
    logger.error(`Failed to process directory: ${dirPath}`, error instanceof Error ? error : undefined);
    throw new Error(`Failed to process directory: ${dirPath}`);
  }
}

/**
 * Process a document source and extract documents
 * @param source Document source configuration
 * @returns Array of processed documents
 */
async function processDocumentSource(source: DocumentSource): Promise<ProcessedDocument[]> {
  switch (source.type) {
    case 'file':
      if (!source.path) throw new Error('File path is required for file source type');
      const content = processTextFile(source.path);
      const metadata = extractMetadataFromFile(source.path);
      return [{
        id: `file_${Date.now()}_0`,
        content,
        metadata
      }];
      
    case 'directory':
      if (!source.path) throw new Error('Directory path is required for directory source type');
      const fileExtensions = source.fileExtensions || ['.txt', '.md'];
      return processDirectory(source.path, fileExtensions);
      
    case 'text':
      if (!source.content) throw new Error('Content is required for text source type');
      return [{
        id: `text_${Date.now()}_0`,
        content: source.content,
        metadata: {
          title: 'Custom Text',
          source: 'Manual Input',
          createdAt: new Date().toISOString()
        }
      }];
      
    case 'url':
      // URL processing would require additional dependencies like axios
      // This is a placeholder for future implementation
      throw new Error('URL source type is not implemented yet');
      
    default:
      throw new Error(`Unsupported source type: ${(source as any).type}`);
  }
}

/**
 * Chunk a document into smaller pieces for better embedding
 * @param document The document to chunk
 * @param maxChunkSize Maximum chunk size in characters
 * @returns Array of chunked documents
 */
function chunkDocument(document: ProcessedDocument, maxChunkSize: number = 1000): ProcessedDocument[] {
  if (document.content.length <= maxChunkSize) {
    return [document];
  }
  
  const chunks: ProcessedDocument[] = [];
  const sentences = document.content.split(/(?<=[.!?])\s+/);
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const sentence of sentences) {
    // If adding this sentence would exceed the max chunk size, create a new chunk
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        id: `${document.id}_chunk_${chunkIndex}`,
        content: currentChunk,
        metadata: {
          ...document.metadata,
          chunkIndex,
          isChunk: true,
          originalDocumentId: document.id
        }
      });
      
      currentChunk = sentence;
      chunkIndex++;
    } else {
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
    }
  }
  
  // Add the last chunk if it's not empty
  if (currentChunk.length > 0) {
    chunks.push({
      id: `${document.id}_chunk_${chunkIndex}`,
      content: currentChunk,
      metadata: {
        ...document.metadata,
        chunkIndex,
        isChunk: true,
        originalDocumentId: document.id
      }
    });
  }
  
  return chunks;
}

/**
 * Embed documents and store them in the vector database
 * @param sources Array of document sources to process
 * @param collectionName Name of the collection to store documents in
 * @param chunkSize Maximum chunk size for document chunking
 */
export async function embedDocuments(
  sources: DocumentSource[],
  collectionName: string = 'documents',
  chunkSize: number = 1000
): Promise<void> {
  try {
    logger.info(`Starting document embedding process for collection: ${collectionName}`);
    
    // Process all document sources
    let allDocuments: ProcessedDocument[] = [];
    for (const source of sources) {
      const documents = await processDocumentSource(source);
      allDocuments = allDocuments.concat(documents);
    }
    
    logger.info(`Processed ${allDocuments.length} documents from ${sources.length} sources`);
    
    // Chunk documents if needed
    const chunkedDocuments: ProcessedDocument[] = [];
    for (const doc of allDocuments) {
      const chunks = chunkDocument(doc, chunkSize);
      chunkedDocuments.push(...chunks);
    }
    
    logger.info(`Created ${chunkedDocuments.length} chunks from ${allDocuments.length} documents`);
    
    // Prepare data for vector database
    const documents = chunkedDocuments.map(doc => doc.content);
    const metadatas = chunkedDocuments.map(doc => doc.metadata);
    const ids = chunkedDocuments.map(doc => doc.id);
    
    // Store documents in the vector database
    await addDocuments(collectionName, documents, metadatas, ids);
    
    logger.info(`Successfully embedded and stored ${chunkedDocuments.length} document chunks in collection: ${collectionName}`);
  } catch (error) {
    logger.error('Failed to embed documents', error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Command-line interface for embedding documents
 */
async function main() {
  try {
    // Check if required environment variables are set
    if (!process.env.OPENAI_API_KEY) {
      logger.error('OPENAI_API_KEY environment variable is not set');
      process.exit(1);
    }
    
    // Parse command-line arguments
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.log('Usage: ts-node embed_documents.ts <source_type> <source_path> [collection_name] [chunk_size]');
      console.log('  source_type: file, directory');
      console.log('  source_path: path to the file or directory');
      console.log('  collection_name: (optional) name of the collection (default: documents)');
      console.log('  chunk_size: (optional) maximum chunk size in characters (default: 1000)');
      process.exit(1);
    }
    
    const sourceType = args[0] as 'file' | 'directory';
    const sourcePath = args[1];
    const collectionName = args[2] || 'documents';
    const chunkSize = parseInt(args[3] || '1000', 10);
    
    // Validate source type
    if (!['file', 'directory'].includes(sourceType)) {
      logger.error(`Invalid source type: ${sourceType}. Must be 'file' or 'directory'`);
      process.exit(1);
    }
    
    // Validate source path
    if (!fs.existsSync(sourcePath)) {
      logger.error(`Source path does not exist: ${sourcePath}`);
      process.exit(1);
    }
    
    // Validate chunk size
    if (isNaN(chunkSize) || chunkSize <= 0) {
      logger.error(`Invalid chunk size: ${args[3]}. Must be a positive number`);
      process.exit(1);
    }
    
    // Embed documents
    await embedDocuments(
      [{ type: sourceType, path: sourcePath }],
      collectionName,
      chunkSize
    );
    
    logger.info('Document embedding completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Document embedding failed', error instanceof Error ? error : undefined);
    process.exit(1);
  }
}

// Execute if this script is run directly
if (require.main === module) {
  main();
}