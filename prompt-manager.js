/**
 * Prompt Manager - Add/Edit Prompts in Local Database
 * Usage: Add new prompts and answers to AJ_AI.logicLibrary
 */

const PromptManager = {
    /**
     * Add a new prompt with 10 randomized answers to the database
     * @param {string} prompt - The trigger prompt (case-insensitive)
     * @param {array} answers - Array of 10 answer strings
     */
    addPrompt: function(prompt, answers) {
        if (!prompt || typeof prompt !== 'string') {
            console.error('Error: Prompt must be a non-empty string');
            return false;
        }
        
        if (!Array.isArray(answers) || answers.length !== 10) {
            console.error('Error: Must provide exactly 10 answers');
            return false;
        }
        
        const normalizedPrompt = prompt.toLowerCase().trim();
        
        // Check if prompt already exists
        if (AJ_AI.logicLibrary[normalizedPrompt]) {
            console.warn(`Warning: Prompt "${prompt}" already exists. Use updatePrompt() to modify.`);
            return false;
        }
        
        // Add the new prompt with randomized selection function
        AJ_AI.logicLibrary[normalizedPrompt] = () => answers[Math.floor(Math.random() * 10)];
        
        console.log(`✓ Prompt added: "${prompt}"`);
        console.log(`  Answers: ${answers.length} options`);
        return true;
    },

    /**
     * Update an existing prompt's answers
     * @param {string} prompt - The trigger prompt to update
     * @param {array} answers - New array of 10 answer strings
     */
    updatePrompt: function(prompt, answers) {
        if (!Array.isArray(answers) || answers.length !== 10) {
            console.error('Error: Must provide exactly 10 answers');
            return false;
        }
        
        const normalizedPrompt = prompt.toLowerCase().trim();
        
        if (!AJ_AI.logicLibrary[normalizedPrompt]) {
            console.error(`Error: Prompt "${prompt}" not found in database`);
            return false;
        }
        
        AJ_AI.logicLibrary[normalizedPrompt] = () => answers[Math.floor(Math.random() * 10)];
        
        console.log(`✓ Prompt updated: "${prompt}"`);
        return true;
    },

    /**
     * Get all prompts in the database
     * @returns {array} List of all prompt keys
     */
    listAllPrompts: function() {
        const prompts = Object.keys(AJ_AI.logicLibrary);
        console.log(`Total prompts in database: ${prompts.length}`);
        console.table(prompts);
        return prompts;
    },

    /**
     * Search for prompts matching a keyword
     * @param {string} keyword - Search keyword
     * @returns {array} Matching prompts
     */
    searchPrompts: function(keyword) {
        const search = keyword.toLowerCase().trim();
        const matches = Object.keys(AJ_AI.logicLibrary).filter(p => p.includes(search));
        console.log(`Found ${matches.length} prompts matching "${keyword}":`);
        console.table(matches);
        return matches;
    },

    /**
     * Get the answers for a specific prompt
     * @param {string} prompt - The prompt to check
     * @returns {string} Sample answer from that prompt
     */
    testPrompt: function(prompt) {
        const normalizedPrompt = prompt.toLowerCase().trim();
        
        if (!AJ_AI.logicLibrary[normalizedPrompt]) {
            console.error(`Error: Prompt "${prompt}" not found`);
            return null;
        }
        
        const answer = AJ_AI.logicLibrary[normalizedPrompt]();
        console.log(`Prompt: "${prompt}"`);
        console.log(`Answer: ${answer}`);
        return answer;
    },

    /**
     * Delete a prompt from the database
     * @param {string} prompt - The prompt to delete
     */
    deletePrompt: function(prompt) {
        const normalizedPrompt = prompt.toLowerCase().trim();
        
        if (!AJ_AI.logicLibrary[normalizedPrompt]) {
            console.error(`Error: Prompt "${prompt}" not found`);
            return false;
        }
        
        delete AJ_AI.logicLibrary[normalizedPrompt];
        console.log(`✓ Prompt deleted: "${prompt}"`);
        return true;
    },

    /**
     * Export current database as JSON (for backup)
     */
    exportDatabase: function() {
        const exported = {};
        for (let key in AJ_AI.logicLibrary) {
            // Test the function 10 times to get a sample of answers
            const samples = new Set();
            for (let i = 0; i < 20; i++) {
                samples.add(AJ_AI.logicLibrary[key]());
            }
            exported[key] = Array.from(samples);
        }
        console.log('Database exported to clipboard-ready format');
        console.log(JSON.stringify(exported, null, 2));
        return exported;
    }
};

// Example Usage:
// PromptManager.addPrompt("hello world", [
//     "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Answer 5",
//     "Answer 6", "Answer 7", "Answer 8", "Answer 9", "Answer 10"
// ]);
//
// PromptManager.testPrompt("hello world");
// PromptManager.listAllPrompts();
// PromptManager.searchPrompts("world");

window.PromptManager = PromptManager;
