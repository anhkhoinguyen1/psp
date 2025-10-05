// import { createClient } from '@base44/sdk';
// // import { getAccessToken } from '@base44/sdk/utils/auth-utils';

// // Create a client with authentication required
// export const base44 = createClient({
//   appId: "68e176fd2349c7d872d5aa2e", 
//   requiresAuth: true // Ensure authentication is required for all operations
// });

import { createClient } from '@base44/sdk';

export const base44 = createClient({
  appId: import.meta.env.VITE_APP_ID ?? "68e176fd2349c7d872d5aa2e",
  requiresAuth: false
});
if (typeof window !== "undefined") window.base44 = base44;