class PlayerSerializer < ActiveModel::Serializer
  has_one :user
  has_many :cards
  has_many :damage_tokens
  has_many :tanks

  attributes :ready, :damage, :outward_hand, :inward_hand

  def damage
    object.damage_tokens.where(fake: false).pluck(:value).inject(:+) || 0
  end

  def outward_hand
    object.cards.where(location: ["hand", "action","trashed"])
  end

  def inward_hand
    object.cards.where(location: ["hand", "drawn", "action"])
  end

end