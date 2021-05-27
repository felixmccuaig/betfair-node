

export function generatePacketID(): number {
    var min = 100000000;
    var max = 999999999;
    return Math.floor(
        Math.random() * (max - min + 1) + min
    );
}