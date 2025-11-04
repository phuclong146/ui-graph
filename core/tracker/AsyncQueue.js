export class AsyncQueue {
    constructor() {
        this.queue = [];
        this.waiting = [];
    }
    put(item) {
        if (this.waiting.length) this.waiting.shift()(item);
        else this.queue.push(item);
    }
    get() {
        return new Promise((res) => {
            if (this.queue.length) res(this.queue.shift());
            else this.waiting.push(res);
        });
    }
    clear() {
        this.queue = [];
        this.waiting = [];
    }
}

