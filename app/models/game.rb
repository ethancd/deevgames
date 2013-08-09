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
              inclusion: { in: %w[draw play move shoot end? discard game_over]}

  def setup_game(ai=false)
    self.phase = "play"
    self.players << Player.create(user_id: 2) if ai

    self.cards = Card.setup_deck(self.id)
    self.damage_tokens = DamageToken.setup_stack(self.id)

    self.players.each do |player|
      self.tanks << Tank.create(game_id: self.id, player_id: player.id, position: 2)
      deck = self.cards.shuffle
      stack = self.damage_tokens.shuffle

      player.cards = deck.pop(3)
      player.damage_tokens = stack.pop(4)

      self.cards = deck
      self.damage_tokens = stack
    end

    10.times do
      card = self.cards.sample
      card.location = "discard"
      card.save
    end
  end


  private
    def players_not_the_same
      if self.users.uniq.count < self.users.count
        errors.add(:player, "you can't play against yourself!")
      end
    end
end
