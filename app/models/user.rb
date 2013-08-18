class User < ActiveRecord::Base
  # Include default devise modules. Others available are:
  # :token_authenticatable, :confirmable,
  # :lockable, :timeoutable and :omniauthable
  devise :database_authenticatable, :registerable, :rememberable, :validatable

  # Setup accessible (or protected) attributes for your model
  attr_accessible :email, :password, :password_confirmation, :remember_me
  attr_accessible :avatar, :username, :login

  attr_accessor :login

  has_many :played_games, class_name: Player
  has_many :games, through: :played_games
  has_many :won_games, class_name: Game, foreign_key: :winner_id
  has_many :lost_games, class_name: Game, foreign_key: :loser_id

  has_attached_file :avatar, {
      styles: {
        thumb: "50x50#",
        medium: "300x300>",
        large: "600x600>"
      },
      default_url: "http://s3.amazonaws.com/DeevDevelopment/users/avatars/000/000/001/thumb1/pengu.jpg?1375805615"
  }

  validates :username, uniqueness: { case_sensitive: false },
            length: { within: 3..20 }, format: { with: /\A[A-Za-z0-9_]*\z/ }

  validates :avatar, attachment_size: { less_than: 250.kilobytes },
            attachment_content_type: { content_type: /image/ }


  def self.find_first_by_auth_conditions(warden_conditions)
    conditions = warden_conditions.dup
    if login = conditions.delete(:login)
      where(conditions).where(["lower(username) = :value OR lower(email) = :value", { :value => login.downcase }]).first
    else
      where(conditions).first
    end
  end

end