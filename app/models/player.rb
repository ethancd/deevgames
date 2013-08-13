class Player < ActiveRecord::Base
  attr_accessible :game_id, :user_id

  belongs_to :game
  belongs_to :user

  has_many :tanks
  has_many :cards
  has_many :damage_tokens

  validates :game, :user, presence: true

  def damage
    self.damage_tokens.where(fake: false).pluck(:value).inject(:+) || 0
  end
end
