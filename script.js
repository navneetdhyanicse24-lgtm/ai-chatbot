document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const chatWindow = document.getElementById('chat-window');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const errorModal = document.getElementById('error-modal');
    const errorMessage = document.getElementById('error-message');
    const closeModalBtn = document.getElementById('close-modal-btn');

    // Gemini API Configuration
    const apiKey = "your api key "; // Leave as-is, Canvas will handle it.
    const model = "gemini-2.5-flash-preview-09-2025";
    // NOTE: fixed hostname typo (generativelanguage.googleapis.com). If you're still getting CORS or auth errors
    // when calling this from the browser, move the key to a server-side proxy to avoid exposing credentials.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Store chat history
    const chatHistory = [];

    // System prompt to give the bot a personality
    const systemPrompt = "You are Astra, a friendly and helpful AI assistant. You are concise in your answers unless asked for detail. You answer in plain text.";

    // --- Event Listeners ---

    // Handle form submission
    if (chatForm) {
        chatForm.addEventListener('submit', handleFormSubmit);
    }

    // Handle error modal close
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            errorModal.classList.add('hidden');
        });
    }

    // --- Functions ---

    /**
     * Main function to handle form submission.
     */
    async function handleFormSubmit(e) {
        e.preventDefault();
        const userMessage = messageInput.value.trim();

        if (userMessage) {
            // Disable input and button
            setChatInputActive(false);

            // Add user message to UI
            appendMessage(userMessage, 'user');
            
            // Add user message to history
            chatHistory.push({ role: "user", parts: [{ text: userMessage }] });

            // Clear input
            messageInput.value = '';

            // Show typing indicator
            showTypingIndicator();

            try {
                // Get response from AI
                const botResponse = await getAIResponse(chatHistory);
                
                // Add AI message to history
                chatHistory.push({ role: "model", parts: [{ text: botResponse }] });

                // Remove typing indicator and add bot message
                removeTypingIndicator();
                appendMessage(botResponse, 'bot');

            } catch (error) {
                console.error("Error getting AI response:", error);
                removeTypingIndicator();
                showError("Oops! Something went wrong. " + error.message);
            } finally {
                // Re-enable input
                setChatInputActive(true);
            }
        }
    }

    /**
     * Fetches a response from the Gemini API with exponential backoff.
     */
    async function getAIResponse(history) {
        const payload = {
            contents: history,
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
        };

        let response;
        let retries = 0;
        const maxRetries = 5;
        let delay = 1000; // 1 second

        while (retries < maxRetries) {
            try {
                response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    break; // Success
                } else if (response.status === 429 || response.status >= 500) {
                    // Throttling or server error, retry
                    console.warn(`API call failed with status ${response.status}. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                    retries++;
                } else {
                    // Other client-side error
                    // Try to read response body for more detail (safe-guard if not JSON)
                    let textBody = null;
                    try {
                        textBody = await response.text();
                    } catch (e) {
                        // ignore
                    }
                    console.error('Non-retriable response', { status: response.status, body: textBody });
                    let errorMsg = `HTTP error! status: ${response.status}`;
                    try {
                        const errorData = JSON.parse(textBody || '{}');
                        errorMsg = errorData.error?.message || errorMsg;
                    } catch (e) {
                        // not JSON
                        if (textBody) errorMsg += ` - ${textBody}`;
                    }
                    throw new Error(errorMsg);
                }

            } catch (error) {
                // Network errors, retry
                console.warn(`Network error: ${error.message}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                retries++;
            }
        }

        if (!response || !response.ok) {
            throw new Error("Failed to get a response from the AI after several retries.");
        }

        const result = await response.json();
        
        // Check for valid candidate and text
        const candidate = result.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        if (text) {
            return text;
        } else {
            // Handle cases where the response is blocked or empty
            const finishReason = candidate?.finishReason;
            if (finishReason === "SAFETY" || finishReason === "RECITATION") {
                return "I'm sorry, I can't respond to that.";
            }
            throw new Error("Received an empty or invalid response from the AI.");
        }
    }

    /**
     * Creates and appends a message bubble to the chat window.
     * @param {string} message - The text content of the message.
     * @param {'user' | 'bot'} sender - 'user' or 'bot'.
     */
    function appendMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-bubble');

        if (sender === 'user') {
            messageElement.classList.add('bg-teal-600', 'text-white', 'self-end', 'rounded-br-none');
        } else {
            messageElement.classList.add('bg-gray-700', 'text-gray-100', 'self-start', 'rounded-bl-none');
        }

        // Set the text content, preserving newlines
        messageElement.textContent = message;
        
        chatWindow.appendChild(messageElement);
        scrollToBottom();
    }

    /**
     * Shows a temporary "typing" bubble.
     */
    function showTypingIndicator() {
        const typingElement = document.createElement('div');
        typingElement.id = 'typing-indicator'; 
        typingElement.classList.add('chat-bubble', 'bg-gray-700', 'text-gray-400', 'self-start', 'rounded-bl-none');
        typingElement.innerHTML = `<span class="animate-pulse">Astra is typing...</span>`;
        
        chatWindow.appendChild(typingElement);
        scrollToBottom();
    }

    /**
     * Removes the "typing" bubble.
     */
    function removeTypingIndicator() {
        const typingElement = document.getElementById('typing-indicator');
        if (typingElement) {
            chatWindow.removeChild(typingElement);
        }
    }

    /**
     * Scrolls the chat window to the bottom.
     */
    function scrollToBottom() {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    /**
     * Toggles the chat input and send button.
     * @param {boolean} active - Whether to enable or disable the input.
     */
    function setChatInputActive(active) {
        messageInput.disabled = !active;
        sendButton.disabled = !active;
        sendButton.classList.toggle('opacity-50', !active);
        sendButton.classList.toggle('cursor-not-allowed', !active);
    }

    /**
     * Shows the error modal with a specific message.
     * @param {string} message - The error message to display.
     */
    function showError(message) {
        errorMessage.textContent = message;
        errorModal.classList.remove('hidden');
    }

    // --- Initial Load ---

    // Add an initial welcome message
    const welcomeMessage = "Hi! I'm Astra, your AI assistant. You can ask me anything!";
    appendMessage(welcomeMessage, 'bot');
    chatHistory.push({ role: "model", parts: [{ text: welcomeMessage }] });
    
});