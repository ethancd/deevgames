class DamageToken < ActiveRecord::Base
  attr_accessible :fake, :game_id, :player_id, :value

  belongs_to :game
  belongs_to :player

  validates :game, :value, presence: true
  validates :value, inclusion: {in: [1, 2, 3]}

  def self.setup_stack(game_id)
    stack = []

    [1,2,3].each do |value|
      10.times do
        stack << DamageToken.create(game_id: game_id, value: value)
      end
    end

    stack
  end
end
