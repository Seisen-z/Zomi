export const GOOGLE_CLIENT_ID = '308713160108-kcejmb0knkkbqq8nn1l66sn7mm1hgf6j.apps.googleusercontent.com';

export function getGoogleScheme(): string {
  const prefix = GOOGLE_CLIENT_ID.split('.apps.googleusercontent.com')[0];
  return `com.googleusercontent.apps.${prefix}`;
}

export function getGoogleRedirectUri(): string {
  return `${getGoogleScheme()}:/oauth2redirect`;
}
