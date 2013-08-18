class Post < ActiveRecord::Base
  attr_accessible :body, :title, :author_id, :image

  belongs_to :author, class_name: User
  has_many :comments, as: :topic

  has_attached_file :image, :styles => { :medium => "300x300>" }

  validates :author, :body, :title, presence: true
end