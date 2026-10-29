export const WEAPONS = [
  { id: 'melee', slot: 1, name: '拳头', short: 'FIST', damage: 15, rate: 0.48,
    magazine: 0, reserveMax: 0, spread: 0, range: 2.6, pellets: 1, price: 0,
    reload: 0, kick: 0.01 },
  { id: 'pistol', slot: 2, name: '城市手枪', short: 'PISTOL', damage: 27, rate: 0.3,
    magazine: 12, reserveMax: 240, spread: 0.012, range: 90, pellets: 1, price: 0,
    reload: 1.05, kick: 0.016 },
  { id: 'smg', slot: 3, name: '海风冲锋枪', short: 'SMG', damage: 13, rate: 0.078,
    magazine: 32, reserveMax: 360, spread: 0.031, range: 72, pellets: 1, price: 1250,
    reload: 1.7, kick: 0.008 },
  { id: 'shotgun', slot: 4, name: '港口霰弹枪', short: 'SHOTGUN', damage: 10, rate: 0.92,
    magazine: 6, reserveMax: 96, spread: 0.062, range: 27, pellets: 8, price: 950,
    reload: 2.1, kick: 0.05 },
];

export function weaponById(id) {
  return WEAPONS.find((weapon) => weapon.id === id) ?? WEAPONS[0];
}

export function pelletSpreads(count, spread, random = Math.random) {
  const spreads = [];
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * spread;
    spreads.push({ yaw: Math.cos(angle) * radius, pitch: Math.sin(angle) * radius });
  }
  return spreads;
}

export function createArsenal() {
  const inventory = { pistol: { loaded: 12, reserve: 72 } };
  let current = 'pistol';
  let lastShot = -Infinity;
  let reloadUntil = 0;
  let reloadWeapon = null;

  function weapon() { return weaponById(current); }
  function owned(id) { return id === 'melee' || Boolean(inventory[id]); }
  function ammo(id) { return inventory[id] ?? { loaded: 0, reserve: 0 }; }
  function isReloading(now) { return Boolean(reloadWeapon) && now < reloadUntil; }

  function switchTo(id, now = 0) {
    if (!owned(id) || id === current) return false;
    if (isReloading(now)) { reloadWeapon = null; reloadUntil = 0; }
    current = id;
    lastShot = -Infinity;
    return true;
  }

  function fire(now, random = Math.random) {
    const gun = weapon();
    if (isReloading(now)) return { blocked: 'reload' };
    if (now - lastShot < gun.rate) return { blocked: 'rate' };
    if (gun.id !== 'melee') {
      const state = inventory[gun.id];
      if (!state || state.loaded <= 0) return { blocked: 'empty' };
      state.loaded--;
    }
    lastShot = now;
    return { weapon: gun, spreads: pelletSpreads(gun.pellets, gun.spread, random) };
  }

  function reload(now = 0) {
    const gun = weapon();
    if (gun.id === 'melee' || isReloading(now)) return false;
    const state = inventory[gun.id];
    if (!state || state.loaded >= gun.magazine || state.reserve <= 0) return false;
    reloadWeapon = gun.id;
    reloadUntil = now + gun.reload;
    return true;
  }

  function update(now) {
    if (!reloadWeapon || now < reloadUntil) return null;
    const gun = weaponById(reloadWeapon);
    const state = inventory[gun.id];
    const missing = gun.magazine - state.loaded;
    const moved = Math.min(missing, state.reserve);
    state.loaded += moved;
    state.reserve -= moved;
    reloadWeapon = null;
    reloadUntil = 0;
    return { weapon: gun.id, loaded: state.loaded };
  }

  function addAmmo(id, amount, changeMagazine = false) {
    if (!inventory[id]) return false;
    const gun = weaponById(id);
    const state = inventory[id];
    state.reserve = Math.min(gun.reserveMax, state.reserve + amount);
    if (changeMagazine) {
      const pulled = Math.min(state.reserve, gun.magazine - state.loaded);
      state.loaded += pulled;
      state.reserve -= pulled;
    }
    return true;
  }

  function unlock(id, loaded = true) {
    const gun = weaponById(id);
    if (gun.id === 'melee' || id === 'melee') return false;
    inventory[id] = { loaded: loaded ? gun.magazine : 0,
      reserve: Math.max(inventory[id]?.reserve ?? 0, loaded ? gun.magazine * 2 : 0) };
    current = id;
    return true;
  }

  function reserveOf(id) { return inventory[id]?.reserve ?? 0; }
  function loadedOf(id) { return inventory[id]?.loaded ?? 0; }

  function snapshot() {
    const data = {};
    for (const [id, state] of Object.entries(inventory)) {
      data[id] = { loaded: state.loaded, reserve: state.reserve };
    }
    return data;
  }

  function restore(data) {
    if (!data || typeof data !== 'object') return false;
    for (const gun of WEAPONS) {
      if (gun.id === 'melee') continue;
      const value = data[gun.id];
      if (!value) continue;
      const loaded = Number(value.loaded);
      const reserve = Number(value.reserve);
      if (!Number.isFinite(loaded) || !Number.isFinite(reserve)) continue;
      inventory[gun.id] = {
        loaded: Math.max(0, Math.min(gun.magazine, Math.floor(loaded))),
        reserve: Math.max(0, Math.min(gun.reserveMax, Math.floor(reserve))),
      };
    }
    const first = WEAPONS.find((gun) => gun.id !== 'melee' && inventory[gun.id]);
    if (first) current = first.id;
    return true;
  }

  return {
    weapon, owned, ammo, reserveOf, loadedOf, switchTo, fire, reload, update,
    addAmmo, unlock, isReloading, snapshot, restore,
    get currentId() { return current; },
    get inventory() { return inventory; },
    get reloadProgress() {
      return reloadWeapon && reloadUntil > lastShot ?
        { id: reloadWeapon, until: reloadUntil } : null;
    },
  };
}
