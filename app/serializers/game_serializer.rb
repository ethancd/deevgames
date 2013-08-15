class GameSerializer < ActiveModel::Serializer
  has_many :players
  has_many :cards
  has_many :damage_tokens
  has_one :winner
  has_one :loser

  attributes :phase, :result
end