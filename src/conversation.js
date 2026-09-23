export class Conversation {
  constructor(maxTurns = 20) {
    this.maxTurns = maxTurns;
    this.messages = [];
  }

  addUserMessage(content) {
    this.messages.push({ role: "user", content });
    this.#trim();
  }

  addAssistantMessage(content) {
    this.messages.push({ role: "assistant", content });
    this.#trim();
  }

  getMessages() {
    return [...this.messages];
  }

  #trim() {
    const maxMessages = this.maxTurns * 2;
    if (this.messages.length > maxMessages) {
      this.messages.splice(0, this.messages.length - maxMessages);
    }
  }
}
