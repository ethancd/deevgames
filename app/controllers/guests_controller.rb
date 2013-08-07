class GuestsController < ApplicationController
  include GuestsHelper

  def create
    g = guest_name
    u = User.new(username: g, email: guest_email(g), avatar: guest_avatar)
    u.guest = true
    u.save!(validate: false)
    sign_in(u)
    redirect_to :root
  end

  def edit
  end

  def destroy
  end
end