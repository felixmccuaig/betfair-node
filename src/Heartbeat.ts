import { catHeartbeat } from "./Logging";

export class Heartbeat {
    private heartAttackTimeout: NodeJS.Timeout;
    private beating = false;
    private heartAttack: any;

    constructor(heartAttack: any) {
        this.heartAttack = heartAttack;
    }
    
    public startBeating(heatbeatMS: number) {
        if(!this.beating) {
            catHeartbeat.debug(`Beating with timeout ${heatbeatMS}ms`);
            //Reduces chance of an accidental heartattack!
            this.heartAttackTimeout = setTimeout(this.heartAttack, heatbeatMS + 2000); 
            this.beating = true;
        }
    }

    public stopBeating() {
        if(this.beating) {
            catHeartbeat.debug(`Heart stopping!`);
            clearTimeout(this.heartAttackTimeout);
            //this.heartAttackTimeout = undefined;
            this.beating = false;
        }
    }

    public heartbeat() {
        if(this.beating) {
            catHeartbeat.silly("Heartbeat");
            this.heartAttackTimeout.refresh();
        } else {
            catHeartbeat.warn("Heart is not beating!");
        }
    }
} 