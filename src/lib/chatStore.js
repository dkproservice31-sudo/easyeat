// Store mémoire pour l'historique du chat assistant cuisinier, indexé par
// recipeId. Sert à conserver la conversation entre RecipeDetailScreen et
// ChefAssistantScreen tant que l'utilisateur reste dans l'app.
// Effacé automatiquement quand l'app est fermée ou rechargée.
const chatStore = {};

export function getChatHistory(recipeId) {
  if (!recipeId) return [];
  return chatStore[recipeId] || [];
}

export function setChatHistory(recipeId, messages) {
  if (!recipeId) return;
  chatStore[recipeId] = messages;
}

export function clearChatHistory(recipeId) {
  if (!recipeId) return;
  delete chatStore[recipeId];
}

export function clearAllChats() {
  for (const k of Object.keys(chatStore)) delete chatStore[k];
}
