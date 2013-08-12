class Game < ActiveRecord::Base
  attr_accessible :phase, :result

  has_many :players
  has_many :users, through: :players

  has_many :cards
  has_many :damage_tokens
  has_many :tanks
  has_many :comments, as: :topic

  #validate :players_not_the_same
  validates :phase, presence: true,
              inclusion: { in: %w[draw play discard game_over]}

  def setup_game(ai=false)
    self.phase = "play"
    self.players << Player.create(user_id: 2) if ai

    self.cards = Card.setup_deck(self.id)
    self.damage_tokens = DamageToken.setup_stack(self.id)

    self.players.each do |player|
      self.tanks << Tank.create(game_id: self.id, player_id: player.id, position: 2)
      self.tanks << Tank.create(game_id: self.id, player_id: player.id,
      fake: true, position: rand < 0.5 ? 3 : 1)

      deal(3, player)
      harm(4, player, false)
    end

    10.times do
      card = self.cards.where(location: "deck").sample
      card.location = "discard"
      card.save
    end
  end

  def deal(n, player)
    n = n.to_i
    if n <= self.cards.where(location: "deck").count
      taken_cards = self.cards.where(location: "deck").sample(n)
      taken_cards.each do |card|
        card.location = "hand"
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
    if n > self.damage_tokens.count
      self.damage_tokens = DamageToken.setup_stack(self.id)
    end

    grabbed_tokens = self.damage_tokens.sample(n)
    grabbed_tokens.sort_by(&:value)[0...-1].each do |token|
      token.player_id = player.id
      token.fake = fake
      token.save
    end
  end

  private
    def players_not_the_same
      if self.users.uniq.count < self.users.count
        errors.add(:player, "you can't play against yourself!")
      end
    end
end
