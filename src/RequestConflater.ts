
import { catRequestConflater } from "./Logging";

export class RequestConflater {
    private conflateMs: number;
    private timeout: NodeJS.Timeout;
    private conflating: boolean;
    private callback: any;

    constructor(conflateMs: number, callback: any) {
        this.conflateMs = conflateMs;
        this.conflating = false;
        this.callback = callback;
        catRequestConflater.info("Request conflater created!");
    }

    public request() {
        if(!this.conflating) {
            this.conflating = true;
            this.timeout = setTimeout(this.fire.bind(this), this.conflateMs);
            catRequestConflater.silly("Request conflater recv request");
        } else {
            this.timeout.refresh();
            catRequestConflater.silly("Request conflater recv update request");
        }
    } 

    private fire() {
        catRequestConflater.silly("Request conflater fire!");
        this.callback();
        this.conflating = false;
    }
}