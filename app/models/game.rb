class Game < ActiveRecord::Base
  LEGAL_SHOTS = {1 => [3], 2 => [2,3], 3 => [1,2,3] }
  attr_accessible :phase, :result, :queue, :winner_id, :loser_id

  has_many :players
  has_many :users, through: :players

  has_many :cards
  has_many :damage_tokens
  has_many :tanks
  has_many :comments, as: :topic

  belongs_to :winner, class_name: User
  belongs_to :loser, class_name: User

  #validate :players_not_the_same
  validates :phase, presence: true,
              inclusion: { in: %w[draw play discard game_over]}

  def setup_game
    self.phase = "play"
    self.cards = Card.setup_deck(self.id)
    self.damage_tokens = DamageToken.setup_stack(self.id)

    self.players.each do |player|
      self.tanks << Tank.create(game_id: self.id, player_id: player.id,
      fake: false, position: 2)

      deal(3, player)
      player.cards.each{|card| card.update_attributes(location: "hand")}
    end
  end

  def game_over(current_user)
    self.update_attributes(phase: "game_over")
    self.players.each{|player| player.update_attributes(ready: false)}

    if self.players.any?{ |player| player.destroyed? }
      if self.players.all? { |player| player.destroyed? }
        self.result = "tie"
      else
        self.players.each_with_index do |player, i|
          if player.destroyed?
            self.loser_id = player.user_id
          else
            self.winner_id = player.user_id
            self.result = i == 0 ? "white_victory" : "black_victory"
          end
        end
      end
      self.save

    else
      self.update_attributes(loser_id: current_user.id,
      winner_id: opponent_id(current_user),
      result: "quit")
    end
  end

  def opponent_id(current_user)
    (self.players.map(&:user) - [current_user])[0].id
  end

  def deal(n, player)
    n = n.to_i
    if n <= self.cards.where(location: "deck").count
      taken_cards = self.cards.where(location: "deck").sample(n)
      taken_cards.each do |card|
        card.location = "drawn"
        card.player_id = player.id
        card.save
      end
    else
      m = n - self.cards.where(location: "deck").count
      deal(self.cards.where(location: "deck").count, player)

      self.cards.where(location: "discard").each do |card|
        card.location = "deck"
        card.save
      end

      deal(m, player)
    end
  end

  def harm(n, player, fake)
    if n > self.damage_tokens.where(player_id: nil).count
      self.damage_tokens += DamageToken.setup_stack(self.id)
    end

    grabbed_tokens = self.damage_tokens.where(player_id: nil).sample(n)
    grabbed_tokens.sort_by(&:value)[0...-1].each do |token|
      token.player_id = player.id
      token.fake = fake
      token.save!
    end
  end

  def resolve_all_actions
    players = self.players

    overheat(players)
    move(players)
    shoot(players)
  end

  private
    def players_not_the_same
      if self.users.uniq.count < self.users.count
        errors.add(:player, "you can't play against yourself!")
      end
    end

    def overheat(players)
      players.each do |player|
        if player.cards.where(location: "action").count == 2
          self.harm(2, player, false)
        end
      end
    end

    def move(players)
      players.each do |player|
        player.cards.where(location: "action").each do |action|
          if action.action_type == "feint" || action.action_type == "move"
            resolve_move(action, player)
            action.player_id = nil
            action.location = "discard"
            action.save
          end
        end
      end
    end

    def shoot(players)
      players.each do |player|
        player.cards.where(location: "action").each do |action|
          resolve_shot(action, player)
          action.player_id = nil
          action.location = "discard"
          action.save
        end
      end
    end

    def resolve(action, tanks)
      if action["action_type"] == "shot"
        resolve_shot(action, tanks.first.player)
      else
        resolve_move(action, tanks.first.player)
      end
    end

    def resolve_move(action, player)
      dx = action["dir"] == "forward" ? 1 : -1
      temp_tanks = []

      player.tanks.each do |tank|
        unless [0,4].include?(tank.position + dx)
          t = Tank.new(player_id: player.id, game_id: self.id,
                       position: tank.position + dx)
          if action["action_type"] == "move" && !tank.fake
            t.fake = false
            tank.fake = true
          else
            t.fake = true
          end
          t.save
          temp_tanks << t
        end
        tank.save
        temp_tanks << tank
      end

      player.tanks = unify_tanks(player.tanks)
      player.tanks.map(&:save)
    end

    def unify_tanks(tanks)
      unless tanks.pluck(:position).uniq.count == tanks.count
        tanks = tanks.pluck(:position).uniq.map do |pos|
          real = tanks.find_by_position_and_fake(pos, false)
          real.nil? ? tanks.find_by_position(pos) : real
        end
      end

      tanks
    end

    def resolve_shot(action, player)
      enemy = player == self.players.first ? self.players.last : self.players.first

      not_spots = [1,2,3] - LEGAL_SHOTS[action[:value].to_i]
      player.tanks.where(position: not_spots).map(&:destroy)

      if enemy.tanks.find_by_position_and_fake(action[:value], false)
        self.harm(3, enemy, false)

        enemy.tanks = [enemy.tanks.create(game_id: self.id,
          position: action[:value].to_i, fake: false)]
      else
        target = enemy.tanks.find_by_position(action[:value])
        target.destroy unless target.nil?
      end
    end

end
