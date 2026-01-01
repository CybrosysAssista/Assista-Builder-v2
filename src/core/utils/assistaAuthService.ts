/**
 * Authentication Service for Assista Coder Extension
 *
 * This service provides methods to retrieve user authentication data
 * from the VS Code authentication provider system.
 */

import * as vscode from 'vscode';

export interface AssistaUserData {
	loginSuccess: boolean;
	accessToken?: string;
	refreshToken?: string;
	sessionId?: string;
	email?: string;
	name?: string;
	provider?: string;
	raw?: string;
}

/**
 * Service to handle authentication data retrieval from VS Code
 */
export class AssistaAuthService {

	/**
	 * Get current authentication sessions for Assista
	 * @returns Promise<AssistaUserData | null> User data if authenticated, null otherwise
	 */
	public static async getUserData(): Promise<AssistaUserData | null> {
		try {
			// Check if authentication is available
			if (!vscode.authentication) {
				// console.warn('[Assista Auth Service] Authentication API not available');
				return null;
			}

			// Get authentication session from VS Code
			const session = await vscode.authentication.getSession('assista', [], { createIfNone: false });

			if (!session) {
				return null;
			}

			// Validate session has required data
			if (!session.account || !session.account.id) {
				// console.warn('[Assista Auth Service] Invalid session data - missing account information');
				return null;
			}

			// Convert VS Code session to our user data format
			const userData: AssistaUserData = {
				loginSuccess: true,
				accessToken: session.accessToken,
				sessionId: session.id,
				email: session.account.id,
				name: session.account.label,
				provider: 'assista'
			};

			return userData;
		} catch (error) {
			// console.error('[Assista Auth Service] Error retrieving user data:', error);
			return null;
		}
	}

	/**
	 * Check if user is currently authenticated
	 * @returns Promise<boolean> True if authenticated, false otherwise
	 */
	public static async isAuthenticated(): Promise<boolean> {
		try {
			const session = await vscode.authentication.getSession('assista', [], { createIfNone: false });
			return !!session;
		} catch (error) {
			// console.error('[Assista Auth Service] Error checking authentication:', error);
			return false;
		}
	}

	/**
	 * Get user display name (fallback to email if name not available)
	 * @returns Promise<string> User display name or fallback
	 */
	public static async getUserDisplayName(): Promise<string> {
		const userData = await this.getUserData();
		if (userData?.name) {
			return userData.name;
		}
		if (userData?.email) {
			// Extract name from email if available (before @)
			const emailParts = userData.email.split('@');
			if (emailParts[0]) {
				// Capitalize first letter and replace dots/underscores with spaces
				return emailParts[0]
					.split(/[._]/)
					.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
					.join(' ');
			}
		}
		return 'User'; // Fallback
	}

	/**
	 * Get user email
	 * @returns Promise<string | null> User email or null
	 */
	public static async getUserEmail(): Promise<string | null> {
		const userData = await this.getUserData();
		return userData?.email || null;
	}

	/**
	 * Get user greeting for welcome screen
	 * @returns Promise<string> Personalized greeting
	 */
	public static async getUserGreeting(): Promise<string> {
		const displayName = await this.getUserDisplayName();
		return `Hey, ${displayName}`;
	}

	/**
	 * Listen for authentication session changes
	 * @param callback Function to call when authentication state changes
	 * @returns vscode.Disposable Disposable to clean up the listener
	 */
	public static onDidChangeSessions(callback: (userData: AssistaUserData | null) => void): vscode.Disposable {
		return vscode.authentication.onDidChangeSessions(async (e) => {
			if (e.provider.id === 'assista') {
				const userData = await this.getUserData();
				callback(userData);
			}
		});
	}
}
