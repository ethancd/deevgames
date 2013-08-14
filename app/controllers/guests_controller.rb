class GuestsController < ApplicationController
  def create
    g = guest_name
    u = User.new(username: g, email: guest_email(g), avatar: guest_avatar)
    u.guest = true
    u.save(validate: false)
    sign_in(u)
    redirect_to :root
  end

  def edit
  end

  def destroy
  end

  private
  def guest_name
    "guest_#{syll}#{syll}"
  end

  def guest_email(name)
    Faker::Internet.free_email(name)
  end

  def guest_avatar
    File.new("#{Rails.root}/app/assets/images/avatars/guest.png")
  end

  def syll #silly name generator
    vowels = %w[a e i o]
    consonants = %w[b d j l m n p r s t v w y z]
    o = consonants.sample
    n = vowels.sample
    c = consonants.sample

    case rand
    when 0..0.1
      n + c
    when 0.1..0.125
      n + n + c
    when 0.125..0.2
      n + c + c
    when 0.2..0.9
      o + n + c
    when 0.9..0.95
      o + n + n + c
    when 0.95..1
      o + n + c + c
    end

  end
end