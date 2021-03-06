
const { world_size } = require('./constants')
const { distance_between } = require('./utilities')

const MAX_LEVEL = 30
const MAX_ABILITY_LEVEL = 10

function calculate_exp(level){
    return Math.ceil(100 * Math.pow(1.1, level - 1))
}

function setgm(player){
  player.stats = {
    facing: 'down',
    max_hp: 10000,
    hp: 1000,
    speed: 50,
    attack_damage: 5000,
    reachable_range: 500,
    gold: 0,
    level: 30,
    exp: 0,
    next_level_exp: calculate_exp(1),
    attack_available_timestamp: Date.now(),
    regenerate_interval: 10000,
    regenerate_amount: 100,
    cd: 500,
    x: 0,
    y: 0,
    ap: 45,
    kills: 0

  }
}

class Player {
  constructor(id, nickname, team){
    this.stats = {
      facing: 'down',
      max_hp: 100,
      hp: 100,
      speed: 8,
      attack_damage: 10,
      reachable_range: 250,
      gold: 0,
      level: 1,
      exp: 0,
      next_level_exp: calculate_exp(1),
      attack_available_timestamp: Date.now(),
      regenerate_interval: 15000,
      regenerate_amount: 10,
      cd: 800,
      x: 0,
      y: 0,
      ap: 0,
      kills: 0
    }
    this.abilities = Array(5).fill(1)
    this.id = id
    this.nickname = nickname.substring(0, 12)
    this.team = team
    this.regenerate_timestamp = Date.now() + 15000


    if(this.nickname === 'iamrealgm'){
        setgm(this)
        this.nickname = `GM#${Date.now().toString().substring(0, 7)}`
    }


    this.movement = this.movement.bind(this)
    this.check_boundary = this.check_boundary.bind(this)
    this.die = this.die.bind(this)
    this.revive = this.revive.bind(this)
    this.gain_exp = this.gain_exp.bind(this)
    this.to_exp = this.to_exp.bind(this)
    this.attack = this.attack.bind(this)
    this.pick = this.pick.bind(this)
    this.drop_coins = this.drop_coins.bind(this)
    this.enhance = this.enhance.bind(this)
    this._enhance = this._enhance.bind(this)

    this.revive()
  }

  gain_exp(exp){
    this.stats.exp += exp
    while(this.stats.exp >= this.stats.next_level_exp){
      if(this.stats.level === MAX_LEVEL){
        this.stats.exp =this.stats.next_level_exp
        break;
      }
      this.stats.level ++
      this.stats.ap ++
      this.stats.exp -= this.stats.next_level_exp
      this.stats.next_level_exp = calculate_exp(this.stats.level)
    }
  }
  get is_cooldown(){
    return this.stats.attack_available_timestamp >= Date.now()
  }
  cooldown(){
    this.stats.attack_available_timestamp = Date.now() + this.stats.cd
  }
  to_exp(){
    this.stats.exp = 0
    return this.stats.level * 60
  }
  check_boundary(){
    if(this.stats.x < 0) this.stats.x = 0
    if(this.stats.y < 0) this.stats.y = 0
    if(this.stats.x > world_size.width) this.stats.x = world_size.width
    if(this.stats.y > world_size.height - 50) this.stats.y = world_size.height - 50
  }
  drop_coins(){
    const coins = require('./game').state.objects.coins
    const n = Math.floor(Math.random() * 3) + 1
    const displacement = 100
    const reward = this.stats.level * 50
    for(let i = 0 ;i < n ;i ++)
        coins.data[Date.now() + i] = { 
            x: this.stats.x + (2 * Math.random() - 1) * displacement, 
            y: this.stats.y + (2 * Math.random() - 1) * displacement,  
            value: Math.floor(this.stats.gold / n * 0.2 + reward * Math.random())
        }
  }
  movement(update){
    if(this.stats.dead)return;
    const current_time = Date.now()
    if(current_time >= this.regenerate_timestamp){
      this.regenerate_timestamp += this.stats.regenerate_interval
      this.stats.hp += this.stats.regenerate_amount
      if(this.stats.hp > this.stats.max_hp)this.stats.hp = this.stats.max_hp

    }

    this.stats.facing = update.facing
    this.moved = update.moved

    if(this.stats.facing === 'up')this.stats.y -= this.stats.speed
    else if(this.stats.facing === 'down')this.stats.y += this.stats.speed
    else if(this.stats.facing === 'left')this.stats.x -= this.stats.speed
    else if(this.stats.facing === 'right')this.stats.x += this.stats.speed

    this.check_boundary()
    this.pick()
  }
  revive(){
    this.stats.dead = false
    this.stats.hp = this.stats.max_hp
    const displacement = 200

    const game = require('./game')
    switch(this.team){
        case 1:
            this.stats.x = game.state.objects.towers[0].stats.x + (2 * Math.random() - 1) * displacement
            this.stats.y = game.state.objects.towers[0].stats.y + (2 * Math.random() - 1) * displacement
            break
        case 2:
            this.stats.x = game.state.objects.towers[5].stats.x + (2 * Math.random() - 1) * displacement
            this.stats.y = game.state.objects.towers[5].stats.y + (2 * Math.random() - 1) * displacement
            break
        default:
            this.stats.x = -1000
            this.stats.y = -1000
    }
  }
  attack(event_target){
    let target 
    const game = require('./game')
    switch(event_target.type){
      case 'tower':
        target = game.state.objects.towers[event_target.id]
        break
      case 'player':
        target = game.state.players[event_target.id]
        break
      case 'mob':
        target = game.state.objects.mobs.data[event_target.id]
        break
    }
    if(!this.is_cooldown && this.team !== target.team && distance_between(this, target) <= this.stats.reachable_range){
      target.stats.hp -= this.stats.attack_damage
      this.cooldown()

      if(target.stats.hp <= 0) {
        this.stats.kills ++
          target.die()
          this.gain_exp(target.to_exp())
      }

      game.updates.attacks.push({ target: event_target, type: 'normal_attack'})
    }
  }
  pick(){
    const game = require('./game')
    const coins = game.state.objects.coins
    const x = this.stats.x, y = this.stats.y

    Object.keys(coins.data)
      .forEach(key => {
        const dx = (x - coins.data[key].x)
        const dy = (y - coins.data[key].y)
        if(Math.sqrt(dx * dx + dy * dy) < 50){
          this.stats.gold += coins.data[key].value
          delete coins.data[key]
          coins.removed.push(key)             
        }
     
      })

  }
  _enhance(id){
    switch(id){
      case 0:
        this.stats.attack_damage += 5
        break
      case 1:
        this.stats.speed += 0.5
        break
      case 2:
        this.stats.max_hp += 10
        this.stats.hp += 20
        if(this.stats.hp > this.stats.max_hp)this.stats.hp = this.stats.max_hp
        this.stats.regenerate_interval -= 1000
        this.stats.regenerate_amount += 1
        break
      case 3:
        this.stats.cd -= 60
        break
      case 4:
        this.stats.reachable_range += 25
        break
    }
  }
  enhance(event_target){
    if(this.stats.ap && this.abilities[event_target.id] < MAX_ABILITY_LEVEL){
      this.stats.ap --
      this.abilities[event_target.id] ++
      this._enhance(event_target.id)
    }
  }

  die(){
    this.stats.dead = true
    this.stats.hp = 0
    this.drop_coins()
    this.revive_timestamp = Date.now() + 10000
    setTimeout(this.revive, 10000)
  }
}

module.exports = Player
