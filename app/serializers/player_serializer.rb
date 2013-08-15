class PlayerSerializer < ActiveModel::Serializer
  has_one :user
  has_many :cards
  has_many :damage_tokens
  has_many :tanks

  attributes :ready
end