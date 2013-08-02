class Comment < ActiveRecord::Base
  attr_accessible :body, :author_id, :parent_id, :topic_id

  belongs_to :author, class_name: User
  belongs_to :parent, class_name: Comment
  belongs_to :topic, polymorphic: true

  has_many :children, class_name: Comment

  validates :author, :post, presence: true
  validates :body, presence: true, length: {maximum: 1000}
end
