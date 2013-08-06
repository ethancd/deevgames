require 'spec_helper'

describe User do

  it "has a valid factory" do
    FactoryGirl.create(:user).should be_valid
  end

  it "is invalid without a username" do
    FactoryGirl.build(:user, username: nil).should_not be_valid
  end

  it "is invalid without an email" do
    FactoryGirl.build(:user, email: nil).should_not be_valid
  end

  it "does not allow duplicate usernames" do
    u = FactoryGirl.create(:user)
    FactoryGirl.build(:user, username: u.username).should_not be_valid
  end

  it "does not allow duplicate emails" do
    u = FactoryGirl.create(:user)
    FactoryGirl.build(:user, email: u.email).should_not be_valid
  end

  it "is invalid without a password" do
    FactoryGirl.build(:user, password: nil).should_not be_valid
  end

  it "is valid even without an avatar" do
    FactoryGirl.build(:user, avatar: nil).should be_valid
  end

  it "is invalid with a pdf avatar" do
    FactoryGirl.build(:user, avatar:
      File.new("#{Rails.root}/app/assets/images/poem.pdf")).should_not be_valid
  end

  it "is invalid with a large image avatar" do
    FactoryGirl.build(:user, avatar:
      File.new("#{Rails.root}/app/assets/images/screenshot.png"))
      .should_not be_valid
  end

end