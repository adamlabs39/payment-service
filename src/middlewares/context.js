export class Context{
    static set(key, value) {
        if (!this.instance) {
            this.instance = {};
        }
        this.instance[key] = value;
    }

    static get(key) {
        return this.instance ? this.instance[key] : null;
    }
}