class Game < ActiveRecord::Base
  attr_accessible :phase, :result

  has_many :players
  has_many :users, through: :players

  has_many :cards
  has_many :damage_tokens
  has_many :tanks
  has_many :comments, as: :topic

  validate :players_not_the_same
  validates :phase, presence: true,
              inclusion: { in: %w[draw play move shoot end? discard game_over]}

  def generate_game(ai=false)
    Player.create(game_id: self.id, player_id: 2) if ai
    self.cards = Card.generate_deck
    self.damage_tokens = DamageToken.generate_stack
    self.tanks = Tank.create(player_id: )
  end


  private
    def players_not_the_same
      if self.users.uniq.count < self.users.count
        errors.add(:white_id, "you can't play against yourself!")
      end
    end
end
