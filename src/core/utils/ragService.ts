import axios from 'axios';

/**
 * RAG Document structure from the server
 */
export interface RAGDocument {
  source: string;
  content?: string;
  score?: number;
}

/**
 * RAG Context response structure
 */
export interface RAGContext {
  context: string;
  documents: RAGDocument[];
  totalChunks: number;
}

/**
 * RAG Service for retrieving Odoo documentation context
 * 
 * This service retrieves relevant context from the Odoo RAG server
 * to enhance the agent's responses with up-to-date documentation.
 */
export class RAGService {
  private ragServerUrl: string;

  constructor(ragServerUrl: string) {
    // Remove trailing slash if present
    this.ragServerUrl = ragServerUrl.replace(/\/$/, '');
  }

  /**
   * Retrieve relevant context from the RAG server
   * @param question - The user's question
   * @param topK - Number of documents to retrieve (default: 5)
   * @returns Retrieved context and documents
   * @throws Error if RAG server request fails
   */
  async retrieveContext(question: string, topK: number = 5): Promise<RAGContext> {

    try {
      const ragPayload = {
        question: question,
        top_k: topK
      };

      const ragRequestConfig = {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds
      };

      const response = await axios.post(
        `${this.ragServerUrl}/api/v1/retrieve`,
        ragPayload,
        ragRequestConfig
      );

      return {
        context: response.data.context || '',
        documents: response.data.documents || [],
        totalChunks: response.data.total_chunks || 0
      };
    } catch (error: any) {
      if (error.response) {
        throw new Error(`RAG Server Error: ${error.response.data?.detail || error.response.statusText}`);
      } else if (error.request) {
        throw new Error(`RAG Server Unreachable: ${error.message}`);
      } else {
        throw new Error(`Request Error: ${error.message}`);
      }
    }
  }
}

